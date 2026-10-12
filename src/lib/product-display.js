export function productDisplayName(name, year) {
	const value = String(name || '').trim();
	const yearText = String(year ?? '').trim();

	if (!value || !yearText) return value;

	// Strip exactly one leading copy of the product year.
	// DB:      "2026 Bowman Football"
	// Display: "Bowman Football"
	const match = value.match(/^(\d{4})\s+(.+)$/);

	if (match && match[1] === yearText) {
		return match[2].trim();
	}

	return value;
}

export function productDisplayTitle(name, year) {
	const displayName = productDisplayName(name, year);
	const yearText = String(year ?? '').trim();

	return [yearText, displayName].filter(Boolean).join(' ').trim();
}
