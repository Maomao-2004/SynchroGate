import { getItem, setItem } from './storage';

const QUEUE_KEY = 'offline_sync_queue';

export const enqueue = async (task) => {
  const queue = await getItem(QUEUE_KEY) || [];
  queue.push(task);
  await setItem(QUEUE_KEY, queue);
};

export const getQueue = async () => {
  return await getItem(QUEUE_KEY) || [];
};

export const clearQueue = async () => {
  await setItem(QUEUE_KEY, []);
};
