// IndexedDB store for custom photos: { id, blob, thumb, location, photographer, addedAt }.

let dbPromise;

// Opens (and creates on first run) the database.
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('momentum-clone', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Runs one request in a transaction and resolves with its result once committed.
async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const dbAll = () => run('readonly', (s) => s.getAll());
export const dbPut = (record) => run('readwrite', (s) => s.put(record));
export const dbDelete = (id) => run('readwrite', (s) => s.delete(id));
