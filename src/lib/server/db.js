export function db(platform) {
  const database = platform?.env?.DB;
  if (!database) throw new Error('D1 binding "DB" is not available. Run with Wrangler or configure the binding.');
  return database;
}

export async function stats(database) {
  const [products, cards, subjects] = await Promise.all([
    database.prepare('SELECT COUNT(*) AS n FROM products WHERE published = 1').first(),
    database.prepare('SELECT COUNT(*) AS n FROM cards c JOIN products p ON p.id = c.product_id WHERE p.published = 1').first(),
    database.prepare('SELECT COUNT(*) AS n FROM subjects').first()
  ]);
  return { products: Number(products?.n || 0), cards: Number(cards?.n || 0), subjects: Number(subjects?.n || 0) };
}
