import { getRichTextEntityLinks } from "@contentful/rich-text-links"

import { makeTypeName } from "./normalize"

// Contentful content type schemas
const ContentfulDataTypes = new Map([
  [
    `Symbol`,
    () => {
      return { type: `String` }
    },
  ],
  [
    `Text`,
    field => {
      return {
        type: `ContentfulNodeTypeText`,
        extensions: {
          link: { by: `id`, from: `${field.id}___NODE` },
        },
      }
    },
  ],
  [
    `Integer`,
    () => {
      return { type: `Int` }
    },
  ],
  [
    `Number`,
    () => {
      return { type: `Float` }
    },
  ],
  [
    `Date`,
    () => {
      return {
        type: `Date`,
        extensions: {
          dateformat: {},
        },
      }
    },
  ],
  [
    `Object`,
    () => {
      return { type: `JSON` }
    },
  ],
  [
    `Boolean`,
    () => {
      return { type: `Boolean` }
    },
  ],
  [
    `Location`,
    () => {
      return { type: `ContentfulNodeTypeLocation` }
    },
  ],
  [
    `RichText`,
    () => {
      return { type: `ContentfulNodeTypeRichText` }
    },
  ],
])

const unionsNameSet = new Set()

const getLinkFieldType = (linkType, field, schema, createTypes) => {
  // Check for validations
  const validations = field?.items?.validations

  if (validations) {
    // We only handle content type validations
    const linkContentTypeValidation = validations.find(
      ({ linkContentType }) => !!linkContentType
    )
    // { validations: [ { linkContentType: [Array] } ] }
    if (linkContentTypeValidation) {
      const { linkContentType } = linkContentTypeValidation
      const contentTypes = Array.isArray(linkContentType)
        ? linkContentType
        : [linkContentType]

      // Full type names for union members, shorter variant for the union type name
      const translatedTypeNames = contentTypes.map(typeName =>
        makeTypeName(typeName)
      )
      const shortTypeNames = contentTypes.map(typeName =>
        makeTypeName(typeName, ``)
      )

      // Single content type
      if (translatedTypeNames.length === 1) {
        return {
          type: translatedTypeNames.shift(),
          extensions: {
            link: { by: `id`, from: `${field.id}___NODE` },
          },
        }
      }

      // Multiple content types
      const unionName = [`UnionContentful`, ...shortTypeNames].join(``)

      if (!unionsNameSet.has(unionName)) {
        unionsNameSet.add(unionName)
        createTypes(
          schema.buildUnionType({
            name: unionName,
            types: translatedTypeNames,
          })
        )
      }

      return {
        type: unionName,
        extensions: {
          link: { by: `id`, from: `${field.id}___NODE` },
        },
      }
    }
  }

  return {
    type: `Contentful${linkType}`,
    extensions: {
      link: { by: `id`, from: `${field.id}___NODE` },
    },
  }
}

const translateFieldType = (field, schema, createTypes) => {
  let fieldType
  if (field.type === `Array`) {
    // Arrays of Contentful Links or primitive types
    const fieldData =
      field.items.type === `Link`
        ? getLinkFieldType(field.items.linkType, field, schema, createTypes)
        : translateFieldType(field.items, schema, createTypes)

    fieldType = { ...fieldData, type: `[${fieldData.type}]` }
  } else if (field.type === `Link`) {
    // Contentful Link (reference) field types
    fieldType = getLinkFieldType(field.linkType, field, schema, createTypes)
  } else {
    // Primitive field types
    fieldType = ContentfulDataTypes.get(field.type)(field)
  }

  if (field.required) {
    fieldType.type = `${fieldType.type}!`
  }

  return fieldType
}

function generateAssetTypes({ createTypes }) {
  createTypes(`
    type ContentfulAsset implements ContentfulInternalReference & Node {
      sys: ContentfulInternalSys
      id: ID!
      title: String
      description: String
      contentType: String
      fileName: String
      url: String
      size: Int
      width: Int
      height: Int
    }
  `)
}

export function generateSchema({
  createTypes,
  schema,
  pluginConfig,
  contentTypeItems,
}) {
  // Generic Types
  createTypes(`
    interface ContentfulInternalReference implements Node {
      id: ID!
      sys: ContentfulInternalSys
    }
  `)

  createTypes(`
    type ContentfulContentType implements Node {
      id: ID!
      name: String!
      displayField: String!
      description: String!
    }
  `)

  createTypes(`
    type ContentfulInternalSys @dontInfer {
      type: String!
      id: String!
      spaceId: String!
      environmentId: String!
      contentType: ContentfulContentType @link(by: "id", from: "contentType___NODE")
      firstPublishedAt: Date!
      publishedAt: Date!
      publishedVersion: Int!
      locale: String!
    }
  `)

  createTypes(`
    interface ContentfulEntry implements Node @dontInfer {
      id: ID!
      sys: ContentfulInternalSys
    }
  `)

  // Assets
  generateAssetTypes({ createTypes })

  // Rich Text
  const makeRichTextLinksResolver = (nodeType, entityType) => (
    source,
    args,
    context
  ) => {
    const links = getRichTextEntityLinks(source, nodeType)[entityType].map(
      ({ id }) => id
    )

    return context.nodeModel.getAllNodes().filter(
      node =>
        node.internal.owner === `gatsby-source-contentful` &&
        node?.sys?.id &&
        node?.sys?.type === entityType &&
        links.includes(node.sys.id)
      // @todo how can we check for correct space and environment? We need to access the sys field of the fields parent entry.
    )
  }

  // Contentful specific types
  createTypes(
    schema.buildObjectType({
      name: `ContentfulNodeTypeRichTextAssets`,
      fields: {
        block: {
          type: `[ContentfulAsset]!`,
          resolve: makeRichTextLinksResolver(`embedded-asset-block`, `Asset`),
        },
        hyperlink: {
          type: `[ContentfulAsset]!`,
          resolve: makeRichTextLinksResolver(`asset-hyperlink`, `Asset`),
        },
      },
    })
  )

  createTypes(
    schema.buildObjectType({
      name: `ContentfulNodeTypeRichTextEntries`,
      fields: {
        inline: {
          type: `[ContentfulEntry]!`,
          resolve: makeRichTextLinksResolver(`embedded-entry-inline`, `Entry`),
        },
        block: {
          type: `[ContentfulEntry]!`,
          resolve: makeRichTextLinksResolver(`embedded-entry-block`, `Entry`),
        },
        hyperlink: {
          type: `[ContentfulEntry]!`,
          resolve: makeRichTextLinksResolver(`entry-hyperlink`, `Entry`),
        },
      },
    })
  )

  createTypes(
    schema.buildObjectType({
      name: `ContentfulNodeTypeRichTextLinks`,
      fields: {
        assets: {
          type: `ContentfulNodeTypeRichTextAssets`,
          resolve(source) {
            return source
          },
        },
        entries: {
          type: `ContentfulNodeTypeRichTextEntries`,
          resolve(source) {
            return source
          },
        },
      },
    })
  )

  createTypes(
    schema.buildObjectType({
      name: `ContentfulNodeTypeRichText`,
      fields: {
        json: {
          type: `JSON`,
          resolve(source) {
            return source
          },
        },
        links: {
          type: `ContentfulNodeTypeRichTextLinks`,
          resolve(source) {
            return source
          },
        },
      },
      extensions: { dontInfer: {} },
    })
  )

  // Location
  createTypes(
    schema.buildObjectType({
      name: `ContentfulNodeTypeLocation`,
      fields: {
        lat: { type: `Float!` },
        lon: { type: `Float!` },
      },
      extensions: {
        dontInfer: {},
      },
    })
  )

  // Text
  // @todo Is there a way to have this as string and let transformer-remark replace it with an object?
  createTypes(
    schema.buildObjectType({
      name: `ContentfulNodeTypeText`,
      fields: {
        raw: `String!`,
      },
      interfaces: [`Node`],
      extensions: {
        dontInfer: {},
      },
    })
  )

  // Content types
  for (const contentTypeItem of contentTypeItems) {
    try {
      const fields = {}
      contentTypeItem.fields.forEach(field => {
        if (field.disabled || field.omitted) {
          return
        }
        fields[field.id] = translateFieldType(field, schema, createTypes)
      })

      const type = pluginConfig.get(`useNameForId`)
        ? contentTypeItem.name
        : contentTypeItem.sys.id

      createTypes(
        schema.buildObjectType({
          name: makeTypeName(type),
          fields: {
            id: { type: `ID!` },
            sys: { type: `ContentfulInternalSys` },
            ...fields,
          },
          interfaces: [
            `ContentfulInternalReference`,
            `ContentfulEntry`,
            `Node`,
          ],
          extensions: { dontInfer: {} },
        })
      )
    } catch (err) {
      err.message = `Unable to create schema for Contentful Content Type ${
        contentTypeItem.name || contentTypeItem.sys.id
      }:\n${err.message}`
      console.log(err.stack)
      throw err
    }
  }
}
