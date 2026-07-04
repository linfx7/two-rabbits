import { PRESETS } from '../data/presets.js';
import { loadState, upsertRule, deleteRule, normalizeDomain, ensureHostPermission, removeHostPermission } from '../data/store.js';

const $ = (id) => document.getElementById(id);

const domainIn = $('domain');
const presetSel = $('preset');
const saveBtn = $('save');
const cancelBtn = $('cancel');
const rulesBody = $('rulesBody');
const openTest = $('openTest');

let editingKey = null;

// populate preset dropdown
for (const [k, v] of Object.entries(PRESETS)) {
  const opt = document.createElement('option');
  opt.value = k; opt.textContent = v.label;
  presetSel.appendChild(opt);
}

function profileSummary(rule) {
  const p = rule.preset && PRESETS[rule.preset];
  if (!p) return '— unknown preset —';
  return `${p.label} — ${p.timezone} · ${p.languages.join(', ')}`;
}

function render() {
  loadState().then((state) => {
    const entries = Object.entries(state.rules || {}).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
      rulesBody.innerHTML = '<tr><td colspan="4" class="muted">No domains yet.</td></tr>';
      return;
    }
    rulesBody.innerHTML = '';
    for (const [domain, rule] of entries) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${domain}</strong></td>
        <td><span class="muted">${profileSummary(rule)}</span></td>
        <td><label class="toggle"><input type="checkbox" data-toggle="${domain}" ${rule.enabled ? 'checked' : ''}/><span class="slider"></span></label></td>
        <td>
          <button class="ghost" data-edit="${domain}">Edit</button>
          <button class="ghost danger" data-del="${domain}" style="color:#d93025">Delete</button>
        </td>`;
      rulesBody.appendChild(tr);
    }
  });
}

function clearForm() {
  editingKey = null;
  domainIn.value = '';
  domainIn.disabled = false;
  presetSel.value = '';
  saveBtn.textContent = 'Add domain';
  cancelBtn.style.display = 'none';
}

function ruleFromForm() {
  const preset = presetSel.value;
  if (!preset) return null;
  return { enabled: true, preset };
}

function fillFormFromRule(domain, rule) {
  editingKey = domain;
  domainIn.value = domain;
  domainIn.disabled = true;
  presetSel.value = rule.preset || '';
  saveBtn.textContent = 'Save changes';
  cancelBtn.style.display = 'inline-block';
}

saveBtn.addEventListener('click', async () => {
  const raw = normalizeDomain(domainIn.value);
  if (!raw) { alert('Enter a domain, e.g. example.com'); return; }
  const rule = ruleFromForm();
  if (!rule) { alert('Choose a preset.'); return; }
  const wasEditing = !!editingKey;
  const targetKey = editingKey || raw;

  if (rule.enabled) {
    const ok = await ensureHostPermission(targetKey);
    if (!ok) {
      alert(`Host permission for ${targetKey} was denied. Request headers won't be rewritten (JS-layer spoof still applies). The domain was still saved as enabled.`);
    }
  }

  // when editing and the domain changed, drop the old key
  if (wasEditing && editingKey !== raw) {
    await deleteRule(editingKey);
  }
  await upsertRule(raw, rule);
  clearForm();
  render();
});

cancelBtn.addEventListener('click', clearForm);

rulesBody.addEventListener('click', async (e) => {
  const editKey = e.target.getAttribute('data-edit');
  const delKey = e.target.getAttribute('data-del');
  if (delKey) {
    if (confirm(`Remove spoof rule for ${delKey}?`)) {
      await deleteRule(delKey);
      await removeHostPermission(delKey);
      if (editingKey === delKey) clearForm();
      render();
    }
    return;
  }
  if (editKey) {
    const state = await loadState();
    const rule = state.rules[editKey];
    if (rule) fillFormFromRule(editKey, rule);
    return;
  }
});

rulesBody.addEventListener('change', async (e) => {
  const toggleKey = e.target.getAttribute('data-toggle');
  if (!toggleKey) return;
  const enabled = e.target.checked;
  const state = await loadState();
  const rule = state.rules[toggleKey];
  if (!rule) return;
  rule.enabled = enabled;
  if (enabled) {
    const ok = await ensureHostPermission(toggleKey);
    if (!ok) alert(`Host permission for ${toggleKey} was denied. Headers won't be rewritten.`);
  } else {
    await removeHostPermission(toggleKey);
  }
  await upsertRule(toggleKey, rule);
  render();
});

openTest.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('src/test/test.html') });
});

render();
