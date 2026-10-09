<script>
  import { extractPdfText } from '$lib/client/pdf.js';
  import { parseChecklistText, groupByChecklist } from '$lib/client/checklist-parser.js';
  import { validateChecklistImport } from '$lib/checklist-validation.js';

  let { data } = $props();
  let year = $state(new Date().getFullYear());
  let name = $state('');
  let sportId = $state();
  let manufacturerId = $state();
  let sourceUrl = $state('');
  let sourceFilename = $state('');
  let rawDialog = $state();
  let text = $state('');
  let parsed = $state(null);
  let busy = $state(false);
  let status = $state('');
  let errorMessage = $state('');
  let selected = $state(new Set());
  let auditFilter = $state('all');

  $effect(() => {
    if (sportId == null) sportId = data.sports[0]?.id ?? 1;
    if (manufacturerId == null) manufacturerId = data.manufacturers[0]?.id ?? 1;
  });

  function finishParse(result) {
    parsed = result;
    selected = new Set(result.cards.map((_, i) => i));
    auditFilter = result.audit?.blockers?.length ? 'blockers' : result.audit?.issues?.length ? 'issues' : 'all';
  }

  async function fileChanged(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    sourceFilename = file.name;
    errorMessage = '';
    busy = true;
    status = 'Reading PDF…';
    try {
      text = await extractPdfText(file);
      status = 'Parsing checklist…';
      const result = parseChecklistText(text, data.affiliations);
      result.audit = validateChecklistImport(result.cards, result.checklist_meta, result.sections);
      finishParse(result);
      status = '';
    } catch (err) {
      errorMessage = err?.message || 'Could not read PDF.';
    } finally {
      busy = false;
    }
  }

  function parsePasted() {
    const result = parseChecklistText(text, data.affiliations);
    result.audit = validateChecklistImport(result.cards, result.checklist_meta, result.sections);
    finishParse(result);
  }

  function toggle(i) {
    const s = new Set(selected);
    s.has(i) ? s.delete(i) : s.add(i);
    selected = s;
  }

  async function importData() {
    if (!parsed || !name) return;
    const cards = parsed.cards.filter((_, i) => selected.has(i));
    const audit = validateChecklistImport(cards, parsed.checklist_meta, parsed.sections);
    if (!audit.canImport) {
      errorMessage = `Import blocked: ${audit.blockers.length} blocking validation issue${audit.blockers.length === 1 ? '' : 's'} must be fixed or deselected.`;
      auditFilter = 'blockers';
      return;
    }

    busy = true;
    status = 'Importing…';
    errorMessage = '';
    try {
      const r = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          year: Number(year),
          name,
          sportId: Number(sportId),
          manufacturerId: Number(manufacturerId),
          sourceUrl,
          sourceFilename,
          cards,
          checklistMeta: parsed.checklist_meta,
          sections: parsed.sections
        })
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.message || 'Import failed');
      location.href = `/sets/${out.slug}`;
    } catch (err) {
      errorMessage = err?.message || 'Import failed';
      busy = false;
      status = '';
    }
  }

  const groups = $derived(parsed ? groupByChecklist(parsed.cards) : {});
  const currentAudit = $derived(parsed ? validateChecklistImport(parsed.cards.filter((_, i) => selected.has(i)), parsed.checklist_meta, parsed.sections) : null);
  const visibleIssues = $derived(!currentAudit ? [] : auditFilter === 'blockers' ? currentAudit.blockers : auditFilter === 'issues' ? currentAudit.issues : currentAudit.issues);
</script>

<svelte:head><title>Import checklist — setbound</title></svelte:head>

<section class="shell page">
  <div class="eyebrow">Admin</div>
  <h1 class="h2">Import a checklist</h1>
  <p class="intro">Upload an official checklist PDF, review what Setbound detected, and validate the data before anything reaches D1.</p>

  <div class="form card-shell">
    <label>Sport<select class="input" bind:value={sportId}>{#each data.sports as s}<option value={s.id}>{s.name}</option>{/each}</select></label>
    <label>Year<input class="input" type="number" bind:value={year}/></label>
    <label>Manufacturer<select class="input" bind:value={manufacturerId}>{#each data.manufacturers as m}<option value={m.id}>{m.name}</option>{/each}</select></label>
    <label class="wide">Product name<input class="input" bind:value={name} placeholder="Allen & Ginter"/></label>
    <label class="wide">Official source URL <span>(optional)</span><input class="input" bind:value={sourceUrl} placeholder="https://…"/></label>
  </div>

  <div class="upload">
    <input id="pdf" type="file" accept="application/pdf" onchange={fileChanged}/>
    <label for="pdf"><strong>{sourceFilename || 'Drop in an official checklist PDF'}</strong><span>{busy ? status : 'PDF text is extracted locally before import.'}</span></label>
    <div>or</div>
    <button class="btn btn-secondary" onclick={() => rawDialog?.showModal()}>Paste extracted text</button>
  </div>

  {#if errorMessage}<div class="error">{errorMessage}</div>{/if}

  {#if parsed && currentAudit}
    <div class="summary">
      <div><strong>{selected.size.toLocaleString()}</strong><span>cards selected</span></div>
      <div><strong>{parsed.sections.length}</strong><span>sections detected</span></div>
      <div class:danger={currentAudit.totals.blockers > 0}><strong>{currentAudit.totals.blockers}</strong><span>blocking issues</span></div>
      <div class:warn={currentAudit.totals.review > 0}><strong>{currentAudit.totals.review}</strong><span>review flags</span></div>
    </div>

    <section class="audit card-shell">
      <div class="audit-head">
        <div>
          <div class="eyebrow">Import audit</div>
          <h2>{currentAudit.canImport ? 'Ready to import' : 'Review required'}</h2>
          <p>
            {#if currentAudit.totals.blockers}
              Resolve or deselect blocking rows before import.
            {:else if currentAudit.totals.review}
              No blockers. Review the flagged rows, then import when you’re comfortable.
            {:else}
              No duplicate conflicts, count mismatches, or low-confidence rows detected.
            {/if}
          </p>
        </div>
        <div class="audit-metrics">
          <span>{currentAudit.totals.lowConfidence} low confidence</span>
          <span>{currentAudit.totals.nilCards} NIL</span>
        </div>
      </div>

      {#if currentAudit.issues.length}
        <div class="audit-tabs">
          <button class:active={auditFilter === 'all'} onclick={() => auditFilter = 'all'}>All issues <span>{currentAudit.issues.length}</span></button>
          <button class:active={auditFilter === 'blockers'} onclick={() => auditFilter = 'blockers'}>Blockers <span>{currentAudit.blockers.length}</span></button>
          <button class:active={auditFilter === 'issues'} onclick={() => auditFilter = 'issues'}>Review <span>{currentAudit.review.length}</span></button>
        </div>
        <div class="issue-list">
          {#each (auditFilter === 'issues' ? currentAudit.review : visibleIssues) as issue}
            <div class:issue-blocker={issue.severity === 'blocker'} class="issue-row">
              <span class="issue-dot"></span>
              <div><strong>{issue.checklist || 'Import'}</strong><p>{issue.message}</p></div>
              <span class="issue-type">{issue.severity === 'blocker' ? 'Blocker' : 'Review'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <div class="review-head">
      <div><h2>Review rows</h2><p>{selected.size.toLocaleString()} of {parsed.cards.length.toLocaleString()} rows selected</p></div>
      <button class="btn btn-accent" disabled={busy || !name || !currentAudit.canImport} onclick={importData}>{busy ? status : `Import ${selected.size.toLocaleString()} cards`}</button>
    </div>

    {#each Object.entries(groups) as [section, cards]}
      {@const meta = parsed.checklist_meta?.[section]}
      {@const sectionAudit = currentAudit.byChecklist?.[section]}
      <details open={sectionAudit?.issues > 0}>
        <summary>
          <div class="summary-title"><strong>{section}</strong>{#if sectionAudit?.blockers}<span class="section-badge blocker">{sectionAudit.blockers} blocker{sectionAudit.blockers === 1 ? '' : 's'}</span>{:else if sectionAudit?.issues}<span class="section-badge">{sectionAudit.issues} review</span>{/if}</div>
          <span>{cards.length} cards{meta?.card_count_declared ? ` · ${meta.card_count_declared} declared` : ''}{meta?.parallels?.length ? ` · ${meta.parallels.length} parallel lines` : ''}</span>
        </summary>
        {#if meta?.parallels?.length}<div class="meta-preview"><strong>Parallel details detected</strong>{#each meta.parallels as line}<span>{line}</span>{/each}</div>{/if}
        <div class="table-wrap"><table><thead><tr><th></th><th>#</th><th>Subject</th><th>Affiliation</th><th>Flags</th><th>Confidence</th></tr></thead><tbody>{#each cards as card}{@const i = parsed.cards.indexOf(card)}<tr class:low={card.confidence < .85}><td><input type="checkbox" checked={selected.has(i)} onchange={() => toggle(i)}/></td><td>{card.card_number}</td><td><strong>{card.subject}</strong></td><td class:muted={card.affiliation === 'NIL'}>{card.affiliation}</td><td>{card.rookie ? 'RC ' : ''}{card.autograph ? 'AU ' : ''}{card.memorabilia ? 'MEM ' : ''}</td><td>{Math.round(card.confidence * 100)}%</td></tr>{/each}</tbody></table></div>
      </details>
    {/each}
  {/if}
</section>

<dialog id="raw" bind:this={rawDialog}><form method="dialog"><div class="modal-head"><strong>Paste checklist text</strong><button>×</button></div><textarea bind:value={text} placeholder="BASE CARDS\n100 cards.\nParallels:\nGold /50\n...\n1 Francisco Lindor New York Mets\n…"></textarea><button class="btn btn-primary" onclick={parsePasted}>Parse text</button></form></dialog>

<style>
  .page{padding-top:4rem}.intro{color:var(--muted);max-width:760px;line-height:1.6}.form{display:grid;grid-template-columns:1fr .7fr 1fr;gap:1rem;padding:1.2rem;margin:2rem 0}.wide{grid-column:span 3}.wide span{font-weight:500}.upload{min-height:150px;border:1px dashed var(--line-strong);border-radius:1rem;display:flex;align-items:center;justify-content:center;gap:1rem;padding:1.5rem;background:#fafafa}.upload input{display:none}.upload label{cursor:pointer;display:flex;flex-direction:column;align-items:center;color:var(--ink)}.upload label span{font-weight:500;color:var(--muted);margin-top:.25rem}.upload>div{color:var(--muted);font-size:.75rem}.error{margin-top:1rem;padding:.8rem 1rem;background:#fff4ea;border:1px solid #f4c89f;border-radius:.7rem}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin:1.5rem 0}.summary>div{border:1px solid var(--line);border-radius:.8rem;background:white;padding:1rem}.summary strong,.summary span{display:block}.summary strong{font-size:1.5rem}.summary span{color:var(--muted);font-size:.75rem;font-weight:700}.summary .warn strong{color:#b66420}.summary .danger{border-color:#e7b2aa;background:#fff8f6}.summary .danger strong{color:#9c3026}.audit{padding:1.2rem;margin:1.25rem 0 2rem}.audit-head{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start}.audit-head h2{margin:.2rem 0 .35rem}.audit-head p{margin:0;color:var(--muted);font-size:.85rem}.audit-metrics{display:flex;gap:.5rem;flex-wrap:wrap}.audit-metrics span,.section-badge,.issue-type{border:1px solid var(--line);border-radius:999px;padding:.32rem .55rem;font-size:.68rem;font-weight:800;background:#fff}.audit-tabs{display:flex;gap:.45rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line)}.audit-tabs button{border:0;background:transparent;padding:.55rem .7rem;border-radius:.55rem;font-weight:800;cursor:pointer}.audit-tabs button span{color:var(--muted);margin-left:.2rem}.audit-tabs button.active{background:#f1f1ef}.issue-list{margin-top:.45rem;border-top:1px solid var(--line)}.issue-row{display:grid;grid-template-columns:10px 1fr auto;gap:.75rem;align-items:center;padding:.78rem .2rem;border-bottom:1px solid var(--line)}.issue-row p{margin:.18rem 0 0;color:var(--muted);font-size:.78rem}.issue-dot{width:7px;height:7px;border-radius:50%;background:var(--orange)}.issue-blocker .issue-dot{background:#a53b32}.issue-blocker .issue-type{border-color:#e2b7b2;color:#8d3028;background:#fff8f7}.review-head{display:flex;justify-content:space-between;align-items:end;margin:2.2rem 0 1rem}.review-head h2,.review-head p{margin:0}.review-head p{color:var(--muted);font-size:.8rem;margin-top:.2rem}details{margin:.7rem 0}summary{cursor:pointer;padding:.85rem 1rem;border:1px solid var(--line);border-radius:.7rem;background:white;display:flex;justify-content:space-between;align-items:center;gap:1rem}.summary-title{display:flex;align-items:center;gap:.55rem;min-width:0}.section-badge{color:#8c5a23;background:#fff9f1;border-color:#efd7b9}.section-badge.blocker{color:#8d3028;background:#fff8f7;border-color:#e2b7b2}summary>span{color:var(--muted);font-size:.75rem;text-align:right}.meta-preview{border-left:2px solid var(--orange);margin:.8rem 1rem 1rem;padding:.15rem 0 .15rem .9rem;display:grid;gap:.28rem}.meta-preview strong{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em}.meta-preview span{font-size:.78rem;color:var(--muted)}.low{background:#fff9f3}dialog{width:min(800px,calc(100% - 2rem));border:0;border-radius:1rem;padding:0;box-shadow:0 30px 90px rgba(0,0,0,.25)}dialog::backdrop{background:rgba(18,16,14,.45)}dialog form{padding:1rem}.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem}.modal-head button{border:0;background:none;font-size:1.5rem;cursor:pointer}textarea{width:100%;min-height:360px;border:1px solid var(--line-strong);border-radius:.7rem;padding:.8rem;font:12px ui-monospace,monospace;margin-bottom:.8rem}@media(max-width:700px){.form{grid-template-columns:1fr 1fr}.wide{grid-column:span 2}.summary{grid-template-columns:1fr 1fr}.upload{flex-direction:column}.review-head,.audit-head{align-items:stretch;flex-direction:column;gap:1rem}}
</style>
