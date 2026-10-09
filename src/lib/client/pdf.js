import { browser } from '$app/environment';

export async function extractPdfText(file) {
	if (!browser) {
		throw new Error('PDF parsing is only available in the browser.');
	}

	const pdfjs = await import('pdfjs-dist');
	const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');

	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

	const data = new Uint8Array(await file.arrayBuffer());
	const pdf = await pdfjs.getDocument({ data }).promise;

	const pages = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		const rows = new Map();

		for (const item of content.items) {
			if (!('str' in item)) continue;

			const x = item.transform[4];
			const y = Math.round(item.transform[5]);

			if (!rows.has(y)) rows.set(y, []);

			rows.get(y).push({
				x,
				text: item.str
			});
		}

		const lines = [...rows.entries()]
			.sort((a, b) => b[0] - a[0])
			.map(([, row]) =>
				row
					.sort((a, b) => a.x - b.x)
					.map((item) => item.text)
					.join(' ')
					.replace(/\s+/g, ' ')
					.trim()
			)
			.filter(Boolean);

		pages.push(lines.join('\n'));
	}

	return pages.join('\n');
}
