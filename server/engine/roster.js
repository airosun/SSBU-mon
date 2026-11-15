// Random fighter generation (Standard draft pools and the Fighter Pass) and roster signing.
// Fighters a player owns live in their browser; the server signs each one so its
// nature, IVs and ability can't be edited before it is used in an Elite Smash battle.
const crypto = require('crypto');
const FIGHTERS = require('../../shared/fighters.json');
const { NATURES } = require('../../shared/dex.js');

const NATURE_NAMES = Object.keys(NATURES);
const SECRET = process.env.SSBU_SECRET || 'dev-only-secret-change-me';
if (!process.env.SSBU_SECRET && process.env.NODE_ENV === 'production') console.warn('SSBU_SECRET is not set: roster signatures use the development secret.');

const uid = () => crypto.randomBytes(8).toString('hex');
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const GENDER = require('../../shared/genders.js');
function genFighter(species, rng = Math.random) {
  const f = typeof species === 'string' ? FIGHTERS.find(x => x.id === species) : species;
  const ivs = {};
  for (const s of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) ivs[s] = Math.floor(rng() * 32);
  return {
    uid: uid(), species: f.id, nature: pick(NATURE_NAMES, rng), ivs,
    ability: rng() < 0.5 ? f.abilities[0].name : f.hidden.name,
    gender: GENDER.roll(f.id, rng),   // not signed: Elite Smash lets you pick it anyway
  };
}

// n random fighters, no repeated species within the pool
function rollPool(n = 20, rng = Math.random) {
  const pool = FIGHTERS.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(genFighter(pool.splice(Math.floor(rng() * pool.length), 1)[0], rng));
  return out;
}

const payload = f => [f.uid, f.species, f.nature, f.ability, ...['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(s => f.ivs && f.ivs[s])].join('|');
function sign(f) { return Object.assign({}, f, { sig: crypto.createHmac('sha256', SECRET).update(payload(f)).digest('hex') }); }
function verify(f) {
  if (!f || typeof f.sig !== 'string') return false;
  const expect = crypto.createHmac('sha256', SECRET).update(payload(f)).digest('hex');
  return f.sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(f.sig), Buffer.from(expect));
}

module.exports = { genFighter, rollPool, sign, verify };
