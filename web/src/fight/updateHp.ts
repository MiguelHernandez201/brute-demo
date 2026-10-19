
import { AnimationFighter } from './utils/findFighter';
import { tween } from './utils/tween';

export const updateHp = (
  fighters: AnimationFighter[],
  fighter: AnimationFighter,
  hp: number,
  speed: React.RefObject<number>,
  isClanWar: boolean,
  fix?: boolean
) => {
  const { hpBar, hpBarPhantom } = fighter;
  let { maxHp } = fighter;

  // Demo: la vida se lleva siempre, aunque el luchador no tenga barra en el HUD. Los brutes agregados al royale
  // nacen sin ella y no recibían los golpes hasta cambiar de lado, y su etiqueta y la lista leen esta vida
  if (fix) {
    // Hp is set to fixed value
    fighter.hp = hp;
  } else {
    // Hp change
    // Prevent overhits
    let realHpChange = hp;

    // Damage
    if (hp < 0) {
      if (fighter.hp <= 0) {
        realHpChange = 0;
      } else if (fighter.hp + hp < 0) {
        realHpChange = -fighter.hp;
      }
    }

    // Keep track of HP
    fighter.hp += realHpChange;

    // Demo: lo que el golpe quita de más (por debajo de 0) queda anotado: en el motor sí cuenta, y si un potenciador le
    // salva antes de verse su caída, se descuenta de su cura (ver demoBoost en setupFight)
    if (realHpChange !== hp) {
      const owed = fighter as AnimationFighter & { demoOverkill?: number };
      owed.demoOverkill = (owed.demoOverkill ?? 0) + realHpChange - hp;
    }
  }

  if (!hpBar || !hpBarPhantom) {
    return;
  }

  let currentHP = 0;

  if (isClanWar && !fighter.master) {
    // hp is the sum of all the fighters' hp
    currentHP = fighters
      .filter((f) => f.team === fighter.team && !f.master)
      .reduce((acc, f) => acc + f.hp, 0);

    // Max HP is the sum of all the fighters' max HP
    maxHp = fighters
      .filter((f) => f.team === fighter.team && !f.master)
      .reduce((acc, f) => acc + f.maxHp, 0);
  } else {
    currentHP = fighter.hp;
  }

  const percent = (currentHP / maxHp) * 236;
  const newWidth = Math.max(1, Math.min(236, percent));

  hpBar.width = newWidth;
  if (currentHP === 0) {
    hpBar.visible = false;
  } else {
    hpBar.visible = true;
  }

  if (fix) {
    hpBarPhantom.width = newWidth;
    if (currentHP === 0) {
      hpBarPhantom.visible = false;
    } else {
      hpBarPhantom.visible = true;
    }
  } else {
    tween(hpBarPhantom, {
      duration: 0.25 / speed.current,
      delay: 0.25 / speed.current,
      ease: 'none',
      width: newWidth,
    }).then(() => {
      if (currentHP === 0) {
        hpBarPhantom.visible = false;
      } else {
        hpBarPhantom.visible = true;
      }
    }).catch((error) => {
      console.error(error);
    });
  }
};
