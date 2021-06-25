import { TaskQueue } from "../task-queue"

describe(`Task Queue`, () => {
  it(`correctly holds all queued items in order`, () => {
    const taskQueue = new TaskQueue<number | string>()

    for (let i = 1; i <= 20; i++) {
      taskQueue.enqueue(i)
    }

    const valuesInQueue: Array<number | string> = []
    for (const item of taskQueue) {
      valuesInQueue.push(item.value)
    }

    expect(valuesInQueue).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
      ]
    `)
  })

  it(`handles removing first item`, () => {
    const taskQueue = new TaskQueue<number | string>()

    for (let i = 1; i <= 20; i++) {
      taskQueue.enqueue(i)
    }

    for (const item of taskQueue) {
      if (item.value === 1) {
        taskQueue.remove(item)
        break
      }
    }

    taskQueue.enqueue(`added after removal`)

    const valuesInQueue: Array<number | string> = []
    for (const item of taskQueue) {
      valuesInQueue.push(item.value)
    }

    expect(valuesInQueue).toMatchInlineSnapshot(`
      Array [
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        "added after removal",
      ]
    `)
  })

  it(`handles removing last item`, () => {
    const taskQueue = new TaskQueue<number | string>()

    for (let i = 1; i <= 20; i++) {
      taskQueue.enqueue(i)
    }

    for (const item of taskQueue) {
      if (item.value === 20) {
        taskQueue.remove(item)
        break
      }
    }

    taskQueue.enqueue(`added after removal`)

    const valuesInQueue: Array<number | string> = []
    for (const item of taskQueue) {
      valuesInQueue.push(item.value)
    }

    expect(valuesInQueue).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        "added after removal",
      ]
    `)
  })

  it(`handles removing item in the middle`, () => {
    const taskQueue = new TaskQueue<number | string>()

    for (let i = 1; i <= 20; i++) {
      taskQueue.enqueue(i)
    }

    for (const item of taskQueue) {
      if (item.value === 11) {
        taskQueue.remove(item)
        break
      }
    }

    taskQueue.enqueue(`added after removal`)

    const valuesInQueue: Array<number | string> = []
    for (const item of taskQueue) {
      valuesInQueue.push(item.value)
    }

    expect(valuesInQueue).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        "added after removal",
      ]
    `)
  })
})
