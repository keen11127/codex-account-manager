function createSerialQueue() {
  let tail = Promise.resolve();
  return {
    run(task) {
      const operation = tail.then(task, task);
      tail = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
  };
}

function createKeyedSerialQueue() {
  const tails = new Map();
  return {
    run(key, task) {
      const previous = tails.get(key) || Promise.resolve();
      const operation = previous.catch(() => undefined).then(task);
      const tail = operation.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      tail.finally(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return operation;
    },
    size() {
      return tails.size;
    },
  };
}

module.exports = {
  createKeyedSerialQueue,
  createSerialQueue,
};
