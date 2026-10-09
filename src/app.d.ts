declare global {
  namespace App {
    interface Platform {
      env: {
        DB: any;
      };
      context: {
        waitUntil(promise: Promise<unknown>): void;
      };
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
