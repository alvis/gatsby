import { IGatsbyIterable } from "../types"

export class GatsbyIterable<T> implements IGatsbyIterable<T> {
  constructor(private source: Iterable<T> | (() => Iterable<T>)) {}

  [Symbol.iterator](): Iterator<T> {
    const source =
      typeof this.source === `function` ? this.source() : this.source
    return source[Symbol.iterator]()
  }

  concat<U = T>(other: Iterable<U>): GatsbyIterable<T | U> {
    return new GatsbyIterable(concatSequence(this, other))
  }

  map<U>(fn: (entry: T) => U): GatsbyIterable<U> {
    return new GatsbyIterable(mapSequence(this, fn))
  }

  filter(predicate: (entry: T) => unknown): GatsbyIterable<T> {
    return new GatsbyIterable(filterSequence(this, predicate))
  }

  flatMap<U>(fn: (entry: T) => U): GatsbyIterable<U> {
    return new GatsbyIterable(flatMapSequence(this, fn))
  }

  slice(start: number, end: number | undefined): GatsbyIterable<T> {
    return new GatsbyIterable<T>(sliceSequence(this, start, end))
  }

  deduplicate(keyFn?: (entry: T) => unknown): GatsbyIterable<T> {
    return new GatsbyIterable<T>(deduplicateSequence(this, keyFn))
  }

  forEach(callback: (entry: T) => unknown): void {
    for (const value of this) {
      callback(value)
    }
  }

  /**
   * Assuming both this and the other iterable are sorted
   * produces the new sorted iterable with interleaved values.
   *
   * Note: this method is not removing duplicates
   */
  mergeSorted<U = T>(
    other: Iterable<U>,
    comparator?: (a: T | U, b: T | U) => number
  ): GatsbyIterable<T | U> {
    return new GatsbyIterable(mergeSorted(this, other, comparator))
  }

  /**
   * Assuming both this and the other iterable are sorted
   * produces the new sorted iterable with values from this iterable
   * that also exist in the other iterable.
   *
   * Note: this method is not removing duplicates
   */
  intersectSorted<U = T>(
    other: Iterable<U>,
    comparator?: (a: T | U, b: T | U) => number
  ): GatsbyIterable<T | U> {
    return new GatsbyIterable(intersectSorted(this, other, comparator))
  }

  /**
   * Assuming this iterable is sorted, removes duplicates from it
   * by applying comparator(prev, current) to sibling iterable values.
   *
   * Comparator function is expected to return 0 when items are equal,
   * similar to Array.prototype.sort() argument.
   *
   * If comparator is not set, uses strict === comparison
   */
  deduplicateSorted(comparator?: (a: T, b: T) => number): GatsbyIterable<T> {
    return new GatsbyIterable<T>(deduplicateSorted(this, comparator))
  }
}

function* mapSequence<T, U>(
  source: Iterable<T>,
  fn: (arg: T) => U
): Generator<U> {
  for (const value of source) {
    yield fn(value)
  }
}

function* flatMapSequence<T, U>(
  source: Iterable<T>,
  fn: (arg: T) => U | Iterable<U>
): Generator<U> {
  for (const value of source) {
    const mapped = fn(value)
    if (isNonArrayIterable(mapped)) {
      // @ts-ignore
      yield* mapped
    } else {
      yield mapped
    }
  }
}

function* sliceSequence<T>(
  source: Iterable<T>,
  start: number,
  end: number | undefined
): Generator<T> {
  if ((typeof end !== `undefined` && end < start) || start < 0)
    throw new Error(
      `Negative offsets for slice() is not supported for iterables`
    )
  let index = -1
  for (const item of source) {
    index++
    if (index < start) continue
    if (typeof end !== `undefined` && index >= end) break
    yield item
  }
}

function isNonArrayIterable<T>(value: unknown): value is Iterable<T> {
  return (
    typeof value === `object` &&
    value !== null &&
    value[Symbol.iterator] &&
    !Array.isArray(value)
  )
}

function* filterSequence<T>(
  source: Iterable<T>,
  predicate: (arg: T) => unknown
): Generator<T> {
  for (const value of source) {
    if (predicate(value)) {
      yield value
    }
  }
}

function* concatSequence<T, U = T>(
  first: Iterable<T>,
  second: Iterable<U>
): Generator<U | T> {
  for (const value of first) {
    yield value
  }
  for (const value of second) {
    yield value
  }
}

function* deduplicateSequence<T>(
  source: Iterable<T>,
  keyFn?: (entry: T) => unknown
): Generator<T> {
  // TODO: this can be potentially improved by using bloom filters?
  const registered = new Set<unknown>()

  for (const current of source) {
    const key = keyFn ? keyFn(current) : current
    if (!registered.has(key)) {
      registered.add(key)
      yield current
    }
  }
}

function* deduplicateSorted<T>(
  source: Iterable<T>,
  comparator: (a: T, b: T) => number = defaultComparator
): Generator<T> {
  let prev
  for (const current of source) {
    if (typeof prev === `undefined` || comparator(prev, current) !== 0) {
      yield current
    }
    prev = current
  }
}

// Merge two originally sorted iterables:
function* mergeSorted<T, U = T>(
  firstSorted: Iterable<T>,
  secondSorted: Iterable<U>,
  comparator: (a: T | U, b: T | U) => number = defaultComparator
): Generator<T | U> {
  const iter1 = firstSorted[Symbol.iterator]()
  const iter2 = secondSorted[Symbol.iterator]()
  let a = iter1.next()
  let b = iter2.next()
  while (!a.done && !b.done) {
    if (comparator(a.value, b.value) <= 0) {
      yield a.value
      a = iter1.next()
    } else {
      yield b.value
      b = iter2.next()
    }
  }
  while (!a.done) {
    yield a.value
    a = iter1.next()
  }
  while (!b.done) {
    yield b.value
    b = iter2.next()
  }
}

function* intersectSorted<T, U = T>(
  firstSorted: Iterable<T>,
  secondSorted: Iterable<U>,
  comparator: (a: T | U, b: T | U) => number = defaultComparator
): Generator<T> {
  const iter1 = firstSorted[Symbol.iterator]()
  const iter2 = secondSorted[Symbol.iterator]()
  let a = iter1.next()
  let b = iter2.next()

  while (!a.done && !b.done) {
    const eq = comparator(a.value, b.value)

    if (eq < 0) {
      // a < b
      a = iter1.next()
    } else if (eq > 0) {
      // a > b
      b = iter2.next()
    } else {
      yield a.value
      a = iter1.next()
    }
  }
}

function defaultComparator<T, U = T>(a: T | U, b: T | U): number {
  if (a === b) {
    return 0
  }
  return a > b ? 1 : -1
}
