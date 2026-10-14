// Tienda a los lados de la pelea: cada jugador puede "comprar" 5 armas al azar o un power-up concreto
// (un botón por power-up, que se activa sí o sí al empezar el siguiente turno).
// La compra entra en el SIGUIENTE TURNO de la pelea en curso (o al empezar la próxima)
// y se queda con ese brute mientras siga en juego.
import labels from './labels-es.json';
import skillsSheet from '../public/images/game/skills.json';
import miscSheet from '../public/images/game/misc.json';
import { skills as coreSkills } from '@labrute/core';

const BASE = import.meta.env.BASE_URL;
const ICON = 28;
const PICK = 5;
const WEAPONS = Object.keys(labels.weapons);
// Solo habilidades activas ("súper" en el juego: Rompecuellos, Bomba, Red, Hipnosis…)
const SKILLS = Object.keys(labels.skills).filter((k) => coreSkills[k]?.type === 'super');
// Botones de power-up (Imitador solo copia habilidades del rival: no tiene sentido activarlo a mano)
const ACTIVABLE = SKILLS.filter((k) => k !== 'mimic');
// Guion opcional (solo aparece si el nombre no cabe en el botón)
const SOFT_NAMES = { hammer: 'Rompe\u00adcuellos', vampirism: 'Vampi\u00adrismo' };
const PETS = { dog1: 'Perro', dog2: 'Perro de caza', dog3: 'Perro guardián', panther: 'Pantera', bear: 'Oso' };

// Compras pendientes para la próxima pelea (null = sin compra)
const emptyPending = () => ({ weapons: null, activate: [], pets: null, potions: 0 });
const pending = { p1: emptyPending(), p2: emptyPending() };
// Equipo con el que pelea cada jugador ahora mismo
const current = { p1: null, p2: null };
let names = ['Jugador 1', 'Jugador 2'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pickRandom = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);

// Icono de habilidad recortado del spritesheet del juego (versión HD x3)
function skillIconStyle(skill, size = ICON) {
  const f = skillsSheet.frames[`tier-1/${skill}.png`]?.frame;
  if (!f) return '';
  const r = size / f.w;
  const { w, h } = skillsSheet.meta.size;
  return `background-image:url(${BASE}images/game/${skillsSheet.meta.image});background-size:${w * r}px ${h * r}px;background-position:-${f.x * r}px -${f.y * r}px`;
}

// Iconos de armas: los mismos de la barra superior de la pelea (hoja misc HD).
// Algunos están rotados/recortados en la hoja, así que se extraen una vez a un canvas.
const weaponIcons = {};
function loadWeaponIcons() {
  const img = new Image();
  img.onload = () => {
    for (const key of WEAPONS) {
      const fr = miscSheet.frames[`weapons/${key}.png`];
      if (!fr) continue;
      const { frame: f, rotated, spriteSourceSize: s, sourceSize: src } = fr;
      const c = document.createElement('canvas');
      c.width = src.w;
      c.height = src.h;
      const ctx = c.getContext('2d');
      ctx.translate(s.x, s.y);
      if (rotated) {
        // TexturePacker guarda el sprite girado 90° en sentido horario: se deshace el giro
        ctx.translate(0, f.h);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(img, f.x, f.y, f.h, f.w, 0, 0, f.h, f.w);
      } else {
        ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      }
      weaponIcons[key] = c.toDataURL();
    }
    renderShop();
  };
  img.src = `${BASE}images/game/${miscSheet.meta.image}`;
}

const weaponIcon = (k) =>
  `<img class="icon" src="${weaponIcons[k] ?? `${BASE}images/weapons/${k}.png`}" alt="" title="${esc(labels.weapons[k] ?? k)}">`;
const petIcon = (k) => `<img class="icon" src="${BASE}images/pets/${k}.svg" alt="" title="${esc(PETS[k] ?? k)}">`;
const skillIcon = (k) =>
  `<span class="icon skill-icon" style="${skillIconStyle(k)}" title="${esc(labels.skills[k]?.name ?? k)}${labels.skills[k]?.desc ? ` — ${esc(labels.skills[k].desc)}` : ''}"></span>`;

// Icono de poción: el de la Poción trágica del juego
const potionIcons = (n) =>
  Array.from(
    { length: n },
    () =>
      `<span class="icon skill-icon" style="${skillIconStyle('tragicPotion')}" title="Poción: cura el 50 % de la vida"></span>`,
  ).join('');

function icons(kind, list) {
  if (!list?.length) return '<span class="none">—</span>';
  return list.map(kind === 'weapons' ? weaponIcon : kind === 'pets' ? petIcon : skillIcon).join('');
}

function renderSide(p, i) {
  const el = document.getElementById(`shop-${p}`);
  if (!el) return;
  const cur = current[p];
  const pend = pending[p];
  const hasPending = pend.weapons || pend.activate.length || pend.pets || pend.potions;
  el.innerHTML = `
    <div class="shop-name">${esc(names[i])}</div>
    <button type="button" class="shop-btn" data-buy="weapons" data-player="${p}">🗡️ Comprar armas</button>
    <div class="shop-label">✨ Power-ups (se activan en el siguiente turno)</div>
    <div class="power-grid">${ACTIVABLE.map(
      (k) =>
        `<button type="button" class="power-btn" data-activate="${k}" data-player="${p}" title="${esc(labels.skills[k]?.desc ?? '')}"><span class="skill-icon" style="${skillIconStyle(k, 20)}"></span><span>${esc(SOFT_NAMES[k] ?? labels.skills[k]?.name ?? k)}</span></button>`,
    ).join('')}</div>
    <button type="button" class="shop-btn" data-buy="pets" data-player="${p}">🐾 Comprar mascota</button>
    <button type="button" class="shop-btn" data-buy="potions" data-player="${p}">🧪 Comprar poción</button>
    ${
      hasPending
        ? `
      <div class="shop-block pending">
        <div class="shop-label">Entra en el próximo turno</div>
        ${pend.weapons ? `<div class="icons">${icons('weapons', pend.weapons)}</div>` : ''}
        ${pend.activate.length ? `<div class="icons">${icons('skills', pend.activate)}</div>` : ''}
        ${pend.pets ? `<div class="icons">${icons('pets', pend.pets)}</div>` : ''}
        ${pend.potions ? `<div class="icons">${potionIcons(pend.potions)}</div>` : ''}
      </div>`
        : ''
    }
    ${
      cur
        ? `
      <div class="shop-block">
        ${cur.hp ? `<div class="shop-label">Vida al empezar</div><div class="hp-line">${cur.hp} / ${cur.maxHp}${cur.hp < cur.maxHp ? ' <span class="hurt">(herido)</span>' : ''}</div>` : ''}
        <div class="shop-label">Armas en uso</div>
        <div class="icons">${icons('weapons', cur.weapons)}</div>
        <div class="shop-label">Power-ups en uso</div>
        <div class="icons">${icons(
          'skills',
          cur.skills.filter((s) => SKILLS.includes(s)),
        )}</div>
        <div class="shop-label">Mascotas</div>
        <div class="icons">${icons('pets', cur.pets)}</div>
      </div>`
        : ''
    }`;
}

export function renderShop() {
  renderSide('p1', 0);
  renderSide('p2', 1);
}

export function setShopNames(n1, n2) {
  names = [n1, n2];
  renderShop();
}

// Equipo real de la pelea que empieza (para mostrarlo bajo los botones)
export function setCurrentGear(brutes) {
  const gear = (b) => ({
    weapons: [...b.weapons],
    skills: [...b.skills],
    pets: [...b.pets],
    maxHp: b.hpValue,
    hp: Math.min(b.hpValue, b.carryHp ?? b.hpValue),
  });
  current.p1 = gear(brutes[0]);
  current.p2 = gear(brutes[1]);
  renderShop();
}

// Entrega las compras pendientes (las pide la pelea antes de cada turno) y las vacía
export function takePurchases() {
  const take = (p) => {
    const { weapons, activate, pets, potions } = pending[p];
    if (!weapons && !activate.length && !pets && !potions) return null;
    pending[p] = emptyPending();
    return { weapons: weapons ?? [], activate, pets: pets ?? [], potions };
  };
  const out = { p1: take('p1'), p2: take('p2') };
  if (out.p1 || out.p2) renderShop();
  return out;
}

loadWeaponIcons();

document.addEventListener('click', (e) => {
  // Power-up concreto: cada clic añade una activación para el siguiente turno
  const power = e.target.closest('[data-activate]');
  if (power) {
    pending[power.dataset.player].activate.push(power.dataset.activate);
    renderShop();
    return;
  }
  const btn = e.target.closest('[data-buy]');
  if (!btn) return;
  const { player, buy } = btn.dataset;
  if (buy === 'potions') {
    // Cada clic compra una poción (se suman si se pulsa varias veces antes del turno)
    pending[player].potions += 1;
  } else if (buy === 'pets') {
    // Cada clic compra una mascota al azar (se suman si se pulsa varias veces antes del turno)
    pending[player].pets = [...(pending[player].pets ?? []), pickRandom(Object.keys(PETS), 1)[0]];
  } else {
    // 5 armas al azar; si se pulsa otra vez antes del turno, se vuelven a sortear
    pending[player][buy] = pickRandom(WEAPONS, PICK);
  }
  renderShop();
});
