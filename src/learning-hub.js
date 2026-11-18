import {mountLearning} from './learning.js';
import {mountBeginner,renderFoundations} from './beginner.js';
import {mountAcademy} from './academy.js';
import {icon} from './ui.js';

const views = [
 {id: 'start', title: 'Start here', icon: 'book-open', detail: 'A first research session'},
 {id: 'foundations', title: 'Core lessons', icon: 'layers', detail: 'Pairs, prices and orders'},
 {id: 'readings', title: 'Read a chart', icon: 'activity', detail: 'Live market examples'},
 {id: 'exercises', title: 'Knowledge check', icon: 'target', detail: 'Apply what you learned'},
 {id: 'glossary', title: 'Glossary', icon: 'file-text', detail: 'Find a crypto term'}
];

export function mountLearningHub(root, {instruments, hydrate, onChart, storage, progress, initialView = 'start', onViewChange = () => {}, mountReadings = mountLearning, mountGuide = mountBeginner}) {
 let child, current, disposed = false;
 const exerciseSession = {index: 0, answers: new Map()};
 const ids = views.map(item => item.id);
 const selected = ids.includes(initialView) ? initialView : 'start';
 root.innerHTML = `<div class="learning-room">
  <div class="learning-shelf" role="tablist" aria-label="Learning sections">${views.map(item => `<button type="button" id="learn-tab-${item.id}" class="learning-shelf-tab" role="tab" data-learning-view="${item.id}" aria-controls="learn-pane-${item.id}" aria-selected="false" tabindex="-1">
    <span class="learning-shelf-icon" aria-hidden="true">${icon(item.icon)}</span><span class="learning-shelf-label"><strong>${item.title}</strong><small>${item.detail}</small></span>
   </button>`).join('')}</div>
  <div class="learning-workbench">${views.map(item => `<section id="learn-pane-${item.id}" class="learning-view-content" role="tabpanel" aria-labelledby="learn-tab-${item.id}" tabindex="0" hidden></section>`).join('')}</div>
 </div>`;
 const tablist = () => [...root.querySelectorAll('[data-learning-view]')];
 const pane = id => root.querySelector('#learn-pane-' + id);

 function select(next) {
  if (disposed || !ids.includes(next) || next === current) return;
  child?.dispose();
  if (current) {
   const previous = pane(current);
   previous.hidden = true;
   previous.innerHTML = '';
  }
  child = null;
  current = next;
  onViewChange(current);
  for (const tab of tablist()) {
   const active = tab.dataset.learningView === current;
   tab.setAttribute('aria-selected', String(active));
   tab.tabIndex = active ? 0 : -1;
  }
  const host = pane(current);
  host.hidden = false;
  if (current === 'foundations') host.innerHTML = renderFoundations();
  else if (current === 'readings') child = mountReadings(host, {instruments, hydrate, onChart});
  else if (current === 'exercises') child = mountAcademy(host, {session: exerciseSession});
  else child = mountGuide(host, {storage, hydrate, view: current, progress});
  hydrate();
 }

 const click = event => {
  const tab = event.target.closest('[data-learning-view]');
  if (tab) select(tab.dataset.learningView);
 };
 const keyboard = event => {
  const tab = event.target.closest('[data-learning-view]');
  if (!tab) return;
  const from = ids.indexOf(tab.dataset.learningView);
  let to;
  if (event.key === 'Home') to = 0;
  else if (event.key === 'End') to = ids.length - 1;
  else if (event.key === 'ArrowRight') to = (from + 1) % ids.length;
  else if (event.key === 'ArrowLeft') to = (from + ids.length - 1) % ids.length;
  else return;
  event.preventDefault();
  root.querySelector('#learn-tab-' + ids[to])?.focus();
 };
 root.addEventListener('click', click);
 root.addEventListener('keydown', keyboard);
 select(selected);
 return {
  refresh() { return child?.refresh?.(); },
  updateInstruments() { child?.updateInstruments?.(); },
  applyTheme() { child?.applyTheme?.(); },
  dispose() {
   disposed = true;
   child?.dispose();
   root.removeEventListener('click', click);
   root.removeEventListener('keydown', keyboard);
  }
 };
}
