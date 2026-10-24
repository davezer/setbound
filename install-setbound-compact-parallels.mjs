import fs from 'node:fs';
const path='src/routes/sets/[slug]/+page.svelte';
if(!fs.existsSync(path)) throw Error('Run this from your Setbound project root.');
let s=fs.readFileSync(path,'utf8');
const start='  {#if data.checklists.some(c=>c.parallels?.length)}';
const end='\n\t<section class="browser">';
const a=s.indexOf(start), b=s.indexOf(end,a);
if(a<0||b<0)throw Error('Could not locate the current parallel section. No files changed.');
const block=`  {#if data.checklists.some(c=>c.parallels?.length)}
    <details class="parallel-guide">
      <summary><span><strong>Parallels & variations</strong><small>Names, print runs and exclusives by checklist</small></span><span>Explore ↗</span></summary>
      <div class="compact-parallels">
        <div class="compact-parallel-controls">
          <label for="parallel-set-choice">Checklist section</label>
          <select id="parallel-set-choice" class="input" bind:value={parallelSection}>
            {#each data.checklists.filter(c=>c.parallels?.length) as c (c.id)}
              <option value={String(c.id)}>{c.name} ({c.parallels.length})</option>
            {/each}
          </select>
        </div>
        {#if currentParallelSection}
          <p class="compact-parallel-count">{currentParallelSection.parallels.length} parallels · {currentParallelSection.name}</p>
          <div class="compact-parallel-scroll">
            <table class="compact-parallel-table">
              <thead><tr><th>Print run</th><th>Parallel</th></tr></thead>
              <tbody>
                {#each currentParallelSection.parallels as item,i (i)}
                  <tr>
                    <td class="compact-parallel-run">{typeof item==='string'?'—':((item.number||item.serial_number||item.print_run||'Unnumbered')==='Unnumbered'?'—':(item.number||item.serial_number||item.print_run))}</td>
                    <td>{typeof item==='string'?item:(item.name||item.label||'Parallel')}{#if typeof item==='object'&&item.availability}<small class="parallel-exclusive">{item.availability}</small>{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </details>
  {/if}`;
s=s.slice(0,a)+block+s.slice(b);
const stateAnchor="\tlet active = $state('All');";
if(s.split(stateAnchor).length!==2)throw Error('Missing active state anchor. No files changed.');
s=s.replace(stateAnchor, stateAnchor+`
  let parallelSection = $state(String(data.checklists.find(c=>c.parallels?.length)?.id ?? ''));
  const currentParallelSection = $derived(data.checklists.find(c=>String(c.id)===parallelSection && c.parallels?.length) || data.checklists.find(c=>c.parallels?.length));`);
const css=`
/* Compact parallel reference: a single section at a time, capped scroll area. */
.compact-parallels{padding:1rem 0 .3rem;max-width:900px}
.compact-parallel-controls{display:flex;align-items:center;gap:.8rem;margin-bottom:.65rem}
.compact-parallel-controls label{font-size:.76rem;font-weight:800;white-space:nowrap}
.compact-parallel-controls select{width:min(100%,480px);max-width:100%}
.compact-parallel-count{margin:.35rem 0 .65rem;color:var(--muted);font-size:.73rem}
.compact-parallel-scroll{max-height:370px;overflow:auto;border:1px solid var(--line);border-radius:.5rem}
.compact-parallel-table{width:100%;border-collapse:collapse;font-size:.79rem}
.compact-parallel-table th{position:sticky;top:0;z-index:1;background:var(--soft);text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:.63rem;color:var(--muted);padding:.65rem .85rem;border-bottom:1px solid var(--line)}
.compact-parallel-table td{padding:.55rem .85rem;border-bottom:1px solid var(--line)}
.compact-parallel-table tr:last-child td{border-bottom:0}
.compact-parallel-run{width:115px;white-space:nowrap;font-weight:800}
@media(max-width:600px){.compact-parallel-controls{display:block}.compact-parallel-controls select{margin-top:.35rem;width:100%}.compact-parallel-scroll{max-height:330px}}
`;
const styleEnd=s.lastIndexOf('</style>');
if(styleEnd<0)throw Error('No style block found. No files changed.');
s=s.slice(0,styleEnd)+css+s.slice(styleEnd);
fs.writeFileSync(path,s);
console.log('Updated the parallel viewer only. No database changes or backups.');
