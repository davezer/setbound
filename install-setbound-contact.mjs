import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const layoutPath = path.join(root, 'src/routes/+layout.svelte');
const checklistPath = path.join(root, 'src/routes/sets/[slug]/+page.svelte');
const contactPath = path.join(root, 'src/routes/contact/+page.svelte');
const read = (p) => { if (!fs.existsSync(p)) throw new Error('Missing required project file: ' + p); return fs.readFileSync(p, 'utf8'); };
const layout = read(layoutPath);
const checklist = read(checklistPath);
const insertOnce = (s, anchor, replacement, check) => {
  if (s.includes(check)) return s;
  if (s.split(anchor).length !== 2) throw new Error('Expected exactly one source anchor: ' + anchor.slice(0, 80));
  return s.replace(anchor, replacement);
};
const footerAnchor = '<span>Built for collectors, not spreadsheets.</span>';
const nextLayout = insertOnce(layout, footerAnchor,
  '<span class="footer-links"><a href="/contact">Contact</a><span>Built for collectors, not spreadsheets.</span></span>',
  'href="/contact"');
const sourceAnchor = '\t<div class="source">';
const promptMarkup = `\t<div class="checklist-feedback">\n\t\t<span>Problems with this checklist? Let us know!</span>\n\t\t<a href={\`mailto:hello.setbound@gmail.com?subject=\${encodeURIComponent('Checklist correction: ' + data.product.year + ' ' + data.product.name + ' (' + data.product.slug + ')')}\`}>hello.setbound@gmail.com ↗</a>\n\t</div>\n\n`;
let nextChecklist = insertOnce(checklist, sourceAnchor, promptMarkup + sourceAnchor, 'class="checklist-feedback"');
const styles = `\n\t.checklist-feedback{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .65rem;margin-top:1.8rem;padding:1rem 0;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem}\n\t.checklist-feedback a{font-weight:800;color:var(--ink);text-decoration:underline;text-decoration-color:var(--orange);text-underline-offset:3px}\n\t.checklist-feedback a:hover{color:var(--orange)}\n`;
if (!nextChecklist.includes('.checklist-feedback{')) {
  if (!nextChecklist.endsWith('</style>\n') && !nextChecklist.endsWith('</style>')) throw new Error('Checklist style tag not at end');
  nextChecklist = nextChecklist.replace(/<\/style>\s*$/, styles + '</style>\n');
}
const contact = `<svelte:head>\n\t<title>Contact Setbound | Checklist Corrections & Support</title>\n\t<meta name="description" content="Contact Setbound about trading card checklist corrections, questions, and feedback." />\n\t<link rel="canonical" href="https://setbound.app/contact" />\n</svelte:head>\n\n<section class="shell contact-page">\n\t<div class="eyebrow">Get in touch</div>\n\t<h1>Contact Setbound.</h1>\n\t<p>Found something wrong with a checklist? Have a question, suggestion, or just want to get in touch? We'd love to hear from you.</p>\n\t<div class="contact-detail">\n\t\t<div class="detail-label">Email us</div>\n\t\t<a href="mailto:hello.setbound@gmail.com">hello.setbound@gmail.com ↗</a>\n\t\t<p>For checklist corrections, include the release name, card number or checklist section, and what needs fixing. A link to the page helps too.</p>\n\t</div>\n</section>\n\n<style>\n\t.contact-page{padding-top:clamp(4rem,9vw,7.5rem);padding-bottom:clamp(5rem,10vw,9rem);max-width:1420px}\n\t.contact-page h1{font-family:var(--display);font-size:clamp(3rem,7vw,5.5rem);letter-spacing:-.065em;line-height:1.05;margin:.9rem 0 1.25rem}\n\t.contact-page>p{max-width:670px;line-height:1.7;color:var(--muted);font-size:1rem}\n\t.contact-detail{border-top:1px solid var(--line);margin-top:3rem;padding-top:1.5rem;max-width:670px}\n\t.detail-label{font-size:.73rem;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:var(--orange);margin-bottom:.65rem}\n\t.contact-detail>a{color:var(--ink);font-size:clamp(1.15rem,3vw,1.8rem);font-weight:750;text-decoration:none;overflow-wrap:anywhere}\n\t.contact-detail>a:hover{text-decoration:underline;text-decoration-color:var(--orange);text-underline-offset:5px}\n\t.contact-detail p{font-size:.87rem;line-height:1.7;color:var(--muted);margin-top:1rem}\n</style>\n`;
// All validation happens before writes.
fs.mkdirSync(path.dirname(contactPath), { recursive: true });
fs.writeFileSync(layoutPath, nextLayout);
fs.writeFileSync(checklistPath, nextChecklist);
fs.writeFileSync(contactPath, contact);
console.log('Added /contact, checklist feedback links, and footer Contact link. No migrations or data changes.');
