/* ============================================================
 *  Сховище: IndexedDB (спільне для «Асистента» та «Академії»)
 * ============================================================ */
let _idbPromise = null;

function openIDB() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise((resolve, reject) => {
        try {
            if (!window.indexedDB) return reject(new Error('no idb'));
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('idb blocked'));
        } catch (e) { reject(e); }
    });
    _idbPromise.catch(() => { _idbPromise = null; });
    return _idbPromise;
}

async function idbGet(key) {
    const idb = await openIDB();
    return new Promise((resolve, reject) => {
        const rq = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
    });
}

async function idbSet(key, value) {
    const idb = await openIDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function idbDelete(key) {
    const idb = await openIDB();
    return new Promise((resolve) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
}
