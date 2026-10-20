

import {
  Fighter, FightStep, isLoser, isWinner, SkillById, SkillId, skills, StepType
} from '@labrute/core';
import { BossName, Fight } from '@labrute/prisma';
import { Theme } from '@mui/material';
import { ColorOverlayFilter } from 'pixi-filters/color-overlay';
import { GlowFilter } from 'pixi-filters/glow';
import { OutlineFilter } from 'pixi-filters/outline';
import { sound } from '@pixi/sound';
import dayjs from 'dayjs';
import { TFunction } from 'react-i18next';
import {
  AnimatedSprite, Application, Color, Container, Graphics, Sprite, Text, Texture, UPDATE_PRIORITY
} from 'pixi.js';
import { RendererContextInterface } from '../../hooks/useRenderer';
import { arrive } from './arrive';
import { attemptHit } from './attemptHit';
import { block } from './block';
import { bomb } from './bomb';
import { death } from './death';
import { fatality, fatalityKind, isFatalityDeath } from './fatality';
import { disarm } from './disarm';
import { dropShield } from './dropShield';
import { eat } from './eat';
import { end } from './end';
import { equip } from './equip';
import { evade } from './evade';
import { arenaBackground, FighterHolder, musicTrack } from './FighterHolder';
import { flashFlood } from './flashFlood';
import { hammer } from './hammer';
import { haste } from './haste';
import { heal } from './heal';
import { hit } from './hit';
import { hypnotise } from './hypnotise';
import { leave } from './leave';
import { moveBack } from './moveBack';
import { moveTo } from './moveTo';
import { regenerate } from './regenerate';
import { resist } from './resist';
import { sabotage } from './sabotage';
import { saboteur } from './saboteur';
import { setHUDFocus } from './setHUDFocus';
import { skillActivate } from './skillActivate';
import { skillExpire } from './skillExpire';
import { spy } from './spy';
import { steal } from './steal';
import { survive } from './survive';
import { throwWeapon } from './throwWeapon';
import { trap } from './trap';
import { trash } from './trash';
import { treat } from './treat';
import { updateWeapons } from './updateWeapons';
import { updateSkills } from './updateSkills';
import { hudControl, isHudLayer } from './utils/hud';
import { updateHp } from './updateHp';
import { displayHeal } from './utils/displayHeal';
import { createBustImage } from './utils/createBustImage';
import { AnimationFighter, findFighter, findHUDFocusedFighter } from './utils/findFighter';
import { isRangedStep, repositionControl, repositionFighters } from './utils/repositionFighters';
import { getDuelPosition, royaleArena } from './utils/fightPositions';
import { royaleAmbient } from './royaleAmbient';
import { royaleTags } from './royaleTags';
import { royaleClock } from './royaleClock';
import { royaleCamera } from './royaleCamera';
import { multiKills } from './multiKill';
import {
  clearUltimates, fightTimer, giantShrink, giantStomp, giantTimer, ultimateBomb, ultimateCast, ultimateCleaveHit,
  ultimateFlood, ultimateHaste, struck,
} from './ultimates';
import { KiAura, kiAura } from './kiAura';
import { MINIGUN_SECONDS, PET_SECONDS } from '../engine/ultimates';
import { Minigun, minigun } from './minigun';
import { resetBakeBudget, setCrowdLevel, updateCrowdQuality } from './crowdQuality';
import { vampirism } from './vampirism';
import { getFighters } from './utils/getFighters';
import { mimic } from './mimic';
import { tween } from './utils/tween';
import { shakeStage } from './utils/stageAnimations';

// Demo: tamaño del brute con Súper gigante
const GIANT_SCALE = 3;
// Demo royale: segundos de pelea tras la curación de un potenciador en los que la del siguiente se suma a ella (ver
// demoBoost)
const HEAL_GROUP_SECONDS = 8;
import { Spritesheets } from './utils/spritesheet';

export const setupFight: (
  theme: Theme,
  fight: Fight,
  app: Application,
  speed: React.RefObject<number>,
  t: TFunction,
  toggleTooltip: (brute: Fighter, open: boolean) => void,
  renderer: RendererContextInterface,
  spritesheets: Spritesheets,
  showPerformanceStats?: boolean,
  isDisposed?: () => boolean,
) => Promise<void> = async (
  theme,
  fight,
  app,
  speed,
  t,
  toggleTooltip,
  renderer,
  spritesheets,
  showPerformanceStats = false,
  isDisposed
) => {
    const shouldAbort = () => (isDisposed?.() ?? false) || !app.stage || app.stage.destroyed;

    type StepPerf = {
      stepName: string;
      index: number;
      samples: number;
      minFps: number;
      sumFrameMs: number;
      maxFrameMs: number;
      frameMsSamples: number[];
    };

    let perfContainer: Container | null = null;
    let perfText: Text | null = null;
    let perfBackground: Graphics | null = null;
    let perfLiveActive = false;
    let perfSummaryPrinted = false;
    let currentStepName = 'setup';
    let currentStepIndex = -1;
    const fpsSamples: number[] = [];
    const frameMsSamples: number[] = [];
    const stepPerf = new Map<string, StepPerf>();

    const getPercentile = (values: number[], percentile: number): number => {
      if (!values.length) {
        return 0;
      }

      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
      );

      return sorted[index] ?? 0;
    };

    // AnimationFighters
    let fighters: AnimationFighter[] = [];

    if (showPerformanceStats && app.stage) {
      const countDisplayObjects = (container: Container): number => container.children
        .reduce(
          (count, child) => count + 1 + (
            child instanceof Container ? countDisplayObjects(child) : 0
          ),
          0,
        );

      perfContainer = new Container();
      perfContainer.zIndex = 3999;
      app.stage.addChild(perfContainer);

      // Background to make the text readable
      perfBackground = new Graphics()
        .rect(0, 0, 140, 40)
        .fill(new Color(0x000000));
      perfBackground.alpha = 0.7;
      perfBackground.zIndex = 3999;
      perfBackground.eventMode = 'none';
      perfContainer.addChild(perfBackground);

      perfText = new Text({
        text: '',
        style: {
          fontFamily: 'Courier New',
          fontSize: 10,
          fill: 0x7CFF9B,
          align: 'left',
        },
      });
      perfText.x = 6;
      perfText.y = 0;
      perfText.zIndex = 4000;
      perfText.eventMode = 'none';
      perfContainer.addChild(perfText);
      perfLiveActive = true;

      let elapsed = 0;
      app.ticker.add(() => {
        if (!perfLiveActive) {
          return;
        }
        if (!perfText) {
          return;
        }

        const elapsedMs = app.ticker.elapsedMS;
        const instantFps = elapsedMs > 0 ? 1000 / elapsedMs : 0;
        const stepKey = `${currentStepName}#${currentStepIndex}`;
        const existingStepPerf = stepPerf.get(stepKey);

        if (existingStepPerf) {
          existingStepPerf.samples += 1;
          existingStepPerf.minFps = Math.min(existingStepPerf.minFps, instantFps);
          existingStepPerf.sumFrameMs += elapsedMs;
          existingStepPerf.maxFrameMs = Math.max(existingStepPerf.maxFrameMs, elapsedMs);
          existingStepPerf.frameMsSamples.push(elapsedMs);
        } else {
          stepPerf.set(stepKey, {
            stepName: currentStepName,
            index: currentStepIndex,
            samples: 1,
            minFps: instantFps,
            sumFrameMs: elapsedMs,
            maxFrameMs: elapsedMs,
            frameMsSamples: [elapsedMs],
          });
        }

        fpsSamples.push(instantFps);
        frameMsSamples.push(elapsedMs);

        elapsed += app.ticker.elapsedMS;

        // Refresh at 10Hz to keep overlay readable with very low overhead.
        if (elapsed < 100) {
          return;
        }
        elapsed = 0;

        const fps = app.ticker.FPS;
        const frameMs = fps > 0 ? 1000 / fps : 0;
        const displayObjects = app.stage ? countDisplayObjects(app.stage) : 0;

        perfText.text = [
          `FPS ${fps.toFixed(1)}`,
          `Frame ${frameMs.toFixed(1)} ms`,
          `DisplayObjects ${displayObjects}`,
        ].join('\n');
      });
    }

    const updatePerformanceSummary = () => {
      if (perfSummaryPrinted || !showPerformanceStats) {
        return;
      }
      perfSummaryPrinted = true;

      perfLiveActive = false;

      const fpsMedian = getPercentile(fpsSamples, 50);
      const frameP95 = getPercentile(frameMsSamples, 95);

      const worstSteps = [...stepPerf.values()]
        .filter((s) => s.samples > 0)
        .sort((a, b) => a.minFps - b.minFps)
        .slice(0, 10)
        .map((s) => ({
          index: s.index,
          step: s.stepName,
          minFps: Number(s.minFps.toFixed(1)),
          avgFps: Number((1000 / (s.sumFrameMs / s.samples)).toFixed(1)),
          p95FrameMs: Number(getPercentile(s.frameMsSamples, 95).toFixed(1)),
          worstFrameMs: Number(s.maxFrameMs.toFixed(1)),
          samples: s.samples,
        }));

      if (worstSteps.length) {
        console.warn('[Fight perf] Lowest FPS steps', worstSteps);
      }

      if (perfText && perfBackground) {
        const currentLines = perfText.text.split('\n').filter(Boolean);
        const topLines = currentLines.slice(0, 3);
        perfText.text = [
          ...topLines,
          `FPS p50 ${fpsMedian.toFixed(1)}`,
          `Frame p95 ${frameP95.toFixed(1)} ms`,
        ].join('\n');

        perfBackground.clear()
          .rect(0, 0, 140, 65)
          .fill(new Color(0x000000));
        perfBackground.alpha = 0.7;
      }
    };

    // Spritesheet
    const miscSheet = spritesheets.misc;

    if (!miscSheet) {
      throw new Error('Misc spritesheet not found');
    }

    const fightFighters = getFighters(fight.fighters);

    const brute1 = fightFighters.find((fighter) => !fighter.master
      && fighter.team === 'L');
    const brute2 = fightFighters.find((fighter) => !fighter.master
      && fighter.team === 'R');
    const boss = fightFighters.find((fighter) => fighter.type === 'boss');

    if (!brute1) {
      throw new Error('Brute not found');
    }

    if (shouldAbort()) return;

    // TODO: Remove this on release, as background extensions were changed
    const roundBackground = fight.background.split('.')[0];
    const backgroundTexture = (name: string) =>
      miscSheet.textures[`background/${name === 'auto' ? roundBackground : name}.jpg`];

    // Add background
    const background = new Sprite(backgroundTexture(arenaBackground.name));
    // Demo: cambiar de fondo desde la interfaz, también en plena pelea
    arenaBackground.apply = (name) => {
      if (!background.destroyed) background.texture = backgroundTexture(name);
    };
    background.zIndex = -1;

    // Fill screen
    background.width = app.screen.width;
    background.height = app.screen.height;

    app.stage?.addChild(background);

    // Add 2px border
    const border = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .stroke({ color: new Color(theme.palette.secondary.main), width: 2 });
    border.zIndex = 102;
    app.stage?.addChild(border);

    // Add headers

    // First brute header
    const team1Header = new Sprite(miscSheet.textures['header.png']);
    team1Header.filters = [new OutlineFilter()];
    team1Header.x = 4;
    team1Header.y = 10;
    team1Header.zIndex = 101;

    // Tooltip on hover/tap
    team1Header.eventMode = 'static';
    team1Header.cursor = 'pointer';
    team1Header.on('pointerover', () => {
      toggleTooltip(findHUDFocusedFighter(fightFighters, fighters, brute1.team) || brute1, true);
    });
    team1Header.on('pointerout', () => {
      toggleTooltip(brute1, false);
    });
    team1Header.on('pointertap', (e) => {
      e.stopPropagation();
      toggleTooltip(findHUDFocusedFighter(fightFighters, fighters, brute1.team) || brute1, true);
    });

    app.stage?.addChild(team1Header);

    // First team name
    const team1Text = new Text({
      text: brute1.name.toLocaleUpperCase(),
      style: {
        fontFamily: 'GameFont', fontSize: 20, fill: 0xffffff
      }
    });
    team1Text.filters = [new OutlineFilter()];
    team1Text.anchor.set(0, 1);
    team1Text.x = 4;
    team1Text.y = 23;
    team1Text.zIndex = 102;
    team1Text.eventMode = 'none';
    app.stage?.addChild(team1Text);

    // First team HP bar
    const team1HpBar = new Graphics()
      .roundRect(0, 0, 236, 9, 4)
      .fill(new Color(theme.palette.hpBar.main));
    team1HpBar.filters = [new GlowFilter({
      distance: 6,
      innerStrength: 2,
      outerStrength: 0,
      color: new Color(theme.palette.hpBar.dark),
    })];
    team1HpBar.x = 7;
    team1HpBar.y = 21;
    team1HpBar.zIndex = 103;
    team1HpBar.label = `${brute1.name}.hp`;
    team1HpBar.eventMode = 'none';
    app.stage?.addChild(team1HpBar);

    // First team phantom HP bar
    const team1PhantomHpBar = new Graphics()
      .roundRect(0, 0, 236, 9, 4)
      .fill(new Color(theme.palette.error.main));
    team1PhantomHpBar.x = 7;
    team1PhantomHpBar.y = 21;
    team1PhantomHpBar.zIndex = 102;
    team1PhantomHpBar.label = `${brute1.name}.hp-phantom`;
    team1PhantomHpBar.eventMode = 'none';
    app.stage?.addChild(team1PhantomHpBar);

    // Reset tooltip on tap anywhere
    if (app.stage) {
      app.stage.eventMode = 'static';
    }
    app.stage?.on('pointertap', () => {
      toggleTooltip(brute1, false);
    });

    // First team bust
    if (shouldAbort()) return;
    const brute1BustImg = await createBustImage(brute1, renderer);
    if (shouldAbort()) return;
    const team1Bust = new Sprite(Texture.from({
      resource: brute1BustImg,
      scaleMode: 'linear'
    }));
    const team1BustContainer = new Container();
    team1BustContainer.x = 52;
    team1BustContainer.y = 35;
    team1BustContainer.zIndex = 102;
    team1BustContainer.scale.y = 0.15;
    team1BustContainer.scale.x = -0.15;
    team1BustContainer.eventMode = 'none';
    app.stage.addChild(team1BustContainer);
    team1BustContainer.addChild(team1Bust);

    // Clip bust to fit in the header
    const team1BustMask = new Graphics()
      .rect(0, 0, 300, 264)
      .fill(0xFFFFFF);
    team1BustContainer.addChild(team1BustMask);
    team1Bust.mask = team1BustMask;

    const team1Weapons: Sprite[] = [];
    const team1Skills: Sprite[] = [];

    let team2Header: Sprite | null = null;
    let team2Text: Text | null = null;
    let team2HpBar: Graphics | null = null;
    let team2PhantomHpBar: Graphics | null = null;
    let brute2BustImg: HTMLImageElement | null = null;
    let team2Bust: Sprite | null = null;
    const team2Weapons: Sprite[] = [];
    const team2Skills: Sprite[] = [];

    if (brute2) {
      // Second team header
      team2Header = new Sprite(miscSheet.textures['header.png']);
      team2Header.filters = [new OutlineFilter()];
      team2Header.scale.x = -1;
      team2Header.x = app.screen.width - 4;
      team2Header.y = 10;
      team2Header.zIndex = 101;

      // Tooltip on hover/tap
      team2Header.eventMode = 'static';
      team2Header.cursor = 'pointer';
      team2Header.on('pointerover', () => {
        toggleTooltip(findHUDFocusedFighter(fightFighters, fighters, brute2.team) || brute2, true);
      });
      team2Header.on('pointerout', () => {
        toggleTooltip(brute2, false);
      });
      team2Header.on('pointertap', (e) => {
        e.stopPropagation();
        toggleTooltip(findHUDFocusedFighter(fightFighters, fighters, brute2.team) || brute2, true);
      });

      app.stage?.addChild(team2Header);

      // Second team name
      team2Text = new Text({
        text: brute2.name.toLocaleUpperCase(),
        style: {
          fontFamily: 'GameFont', fontSize: 20, fill: 0xffffff, align: 'right'
        }
      });
      team2Text.filters = [new OutlineFilter()];
      team2Text.anchor.set(1, 1);
      team2Text.x = app.screen.width - 4;
      team2Text.y = 23;
      team2Text.zIndex = 102;
      team2Text.eventMode = 'none';
      app.stage?.addChild(team2Text);

      // Second team HP bar
      team2HpBar = new Graphics()
        .roundRect(0, 0, 236, 9, 4)
        .fill(new Color(theme.palette.hpBar.main));
      team2HpBar.filters = [new GlowFilter({
        distance: 6,
        innerStrength: 2,
        outerStrength: 0,
        color: new Color(theme.palette.hpBar.dark),
      })];
      team2HpBar.scale.x = -1;
      team2HpBar.x = app.screen.width - 7;
      team2HpBar.y = 21;
      team2HpBar.zIndex = 103;
      team2HpBar.label = `${brute2.name}.hp`;
      team2HpBar.eventMode = 'none';
      app.stage?.addChild(team2HpBar);

      // Second team phantom HP bar
      team2PhantomHpBar = new Graphics()
        .roundRect(0, 0, 236, 9, 4)
        .fill(new Color(theme.palette.error.main));
      team2PhantomHpBar.scale.x = -1;
      team2PhantomHpBar.x = app.screen.width - 7;
      team2PhantomHpBar.y = 21;
      team2PhantomHpBar.zIndex = 102;
      team2PhantomHpBar.label = `${brute2.name}.hp-phantom`;
      team2PhantomHpBar.eventMode = 'none';
      app.stage?.addChild(team2PhantomHpBar);

      // Second team bust
      if (shouldAbort()) return;
      brute2BustImg = await createBustImage(brute2, renderer);
      if (shouldAbort()) return;
      team2Bust = new Sprite(Texture.from({
        resource: brute2BustImg,
        scaleMode: 'linear'
      }));
      const team2BustContainer = new Container();
      team2BustContainer.x = 450;
      team2BustContainer.y = 35;
      team2BustContainer.zIndex = 102;
      team2BustContainer.scale.y = 0.15;
      team2BustContainer.scale.x = 0.15;
      team2BustContainer.eventMode = 'none';
      app.stage?.addChild(team2BustContainer);
      team2BustContainer.addChild(team2Bust);

      // Clip bust to fit in the header
      const team2BustMask = new Graphics()
        .rect(0, 0, 300, 264)
        .fill(0xFFFFFF);
      team2BustContainer.addChild(team2BustMask);
      team2Bust.mask = team2BustMask;
    }

    let bossHeader: Sprite | null = null;
    let bossHpBar: Graphics | null = null;
    let bossPhantomHpBar: Graphics | null = null;
    if (boss) {
      // Boss header
      bossHeader = new Sprite(miscSheet.textures['header.png']);
      bossHeader.filters = [new OutlineFilter()];
      bossHeader.scale.x = -1;
      bossHeader.x = app.screen.width - 4;
      bossHeader.y = 10;
      bossHeader.zIndex = 101;

      app.stage?.addChild(bossHeader);

      // Boss name
      const displayedBossName = (
        // Normal day Display
        !dayjs.utc().isSame(dayjs.utc('04-01', 'MM-DD'), 'day') ? boss.name
          // April Fools Display
          : boss.name === BossName.EmberFang ? 'EmberFool'
            : boss.name === BossName.GoldClaw ? 'GoldClown'
              : boss.name
      );

      const bossName = new Text({
        text: displayedBossName.toLocaleUpperCase(),
        style: {
          fontFamily: 'GameFont', fontSize: 20, fill: 0xffffff, align: 'right'
        }
      });
      bossName.filters = [new OutlineFilter()];
      bossName.anchor.set(1, 1);
      bossName.x = app.screen.width - 4;
      bossName.y = 23;
      bossName.zIndex = 102;
      app.stage?.addChild(bossName);

      // Boss HP bar
      bossHpBar = new Graphics()
        .roundRect(0, 0, (boss.hp / boss.maxHp) * 236, 9, 4)
        .fill(new Color(theme.palette.hpBar.main));
      bossHpBar.filters = [new GlowFilter({
        distance: 6,
        innerStrength: 2,
        outerStrength: 0,
        color: new Color(theme.palette.hpBar.dark),
      })];
      bossHpBar.scale.x = -1;
      bossHpBar.x = app.screen.width - 7;
      bossHpBar.y = 21;
      bossHpBar.zIndex = 103;
      bossHpBar.label = `${boss.name}.hp`;
      app.stage?.addChild(bossHpBar);

      // Boss phantom HP bar
      bossPhantomHpBar = new Graphics()
        .roundRect(0, 0, (boss.hp / boss.maxHp) * 236, 9, 4)
        .fill(new Color(theme.palette.error.main));
      bossPhantomHpBar.scale.x = -1;
      bossPhantomHpBar.x = app.screen.width - 7;
      bossPhantomHpBar.y = 21;
      bossPhantomHpBar.zIndex = 102;
      bossPhantomHpBar.label = `${boss.name}.hp-phantom`;
      app.stage?.addChild(bossPhantomHpBar);
    }

    // Set stage as sortable
    if (app.stage) {
      app.stage.sortableChildren = true;
    }

    // Set background music
    if (shouldAbort()) return;
    await sound.play(musicTrack.name, { loop: true });

    // Get fighters animations
    if (shouldAbort()) return;

    // Demo: calidad dinámica según cuántos hay en pie (ver crowdQuality). Va antes que los luchadores en cada
    // fotograma: renueva el cupo de horneado y, cada medio segundo, ajusta el nivel
    setCrowdLevel(0);
    let qualityClock = 0;
    app.ticker.add((ticker) => {
      resetBakeBudget();
      qualityClock += ticker.elapsedMS;
      if (qualityClock < 500) return;
      qualityClock = 0;
      updateCrowdQuality(fighters.filter((f) => !f.dead && f.animation.container.visible).length);
    }, undefined, UPDATE_PRIORITY.HIGH);

    // Usos de cada habilidad del luchador (Demo: también para los que entran en plena pelea)
    const animationSkills = (fighter: Fighter) => Object.fromEntries(Object.entries(fighter.skills).map(([skillId, tier]) => {
      let skillUses = skills[SkillById[+skillId as SkillId]].uses?.[tier - 1] ?? 0;

      // Add one fierceBrute every 30 strength
      if (+skillId === SkillId.fierceBrute) {
        skillUses += Math.floor(fighter.strength / 30);
      }

      return [
        skillId,
        {
          tier,
          uses: skillUses,
        },
      ];
    }));

    const nextFighters: AnimationFighter[] = [];

    for (const fighter of fightFighters) {
      if (shouldAbort()) {
        for (const createdFighter of nextFighters) {
          createdFighter.animation.destroy();
        }
        return;
      }

      // Necessary since .team was added later
      // TODO: Remove on release
      if (!fighter.team) {
        fighter.team = (fighter.master || fighter.id) === brute1.id ? 'L' : 'R';
      }

      const animationFighter: AnimationFighter = {
        ...fighter,
        hpBar: (fighter.master
          ? undefined
          : fighter.team === brute1.team
            ? team1HpBar
            : fighter.team === brute2?.team
              ? team2HpBar
              : fighter.id === boss?.id
                ? bossHpBar
                : undefined) ?? undefined,
        hpBarPhantom: (fighter.master
          ? undefined
          : fighter.team === brute1.team
            ? team1PhantomHpBar
            : fighter.team === brute2?.team
              ? team2PhantomHpBar
              : fighter.id === boss?.id
                ? bossPhantomHpBar
                : undefined) ?? undefined,
        bustImage: (fighter.type === 'pet'
          ? null
          : fighter.id === brute1.id
            ? brute1BustImg
            : fighter.id === brute2?.id
              ? brute2BustImg
              : null) ?? null,
        bust: (fighter.type === 'pet'
          ? undefined
          : fighter.team === brute1.team
            ? team1Bust
            : fighter.team === brute2?.team
              ? team2Bust
              : undefined) ?? undefined,
        text: (fighter.type === 'pet'
          ? undefined
          : fighter.team === brute1.team
            ? team1Text
            : fighter.team === brute2?.team
              ? team2Text
              : undefined) ?? undefined,
        teamWeaponsIllustrations: fighter.team === brute1.team ? team1Weapons : team2Weapons,
        teamSkillsIllustrations: fighter.team === brute1.team ? team1Skills : team2Skills,
        HUDFocused: fighter.id === brute2?.id || fighter.id === brute1?.id,
        skills: animationSkills(fighter),
        animation: new FighterHolder(
          app,
          fighter,
          speed,
          fighter.size
        ),
      };

      // Set position
      animationFighter.animation.container.x = fighter.team === 'L' ? -100 : 600;
      animationFighter.animation.container.y = 150;

      // Add to stage
      app.stage?.addChild(animationFighter.animation.container);

      // Update brute weapons
      updateWeapons(app, spritesheets, animationFighter);

      nextFighters.push(animationFighter);
    }

    fighters = nextFighters;
    // Demo: acceso en vivo a los luchadores animados (vida actual) para la lista del battle royale
    (fight as unknown as { liveFighters?: () => AnimationFighter[] }).liveFighters = () => fighters;

    // Wait for all fighters to be loaded
    while (!shouldAbort() && fighters.some((fighter) => !fighter.animation.loaded)) {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    if (shouldAbort()) return;

    const isClanWar = !!fight.clanWarId;

    // Demo: las barras de vida se crean llenas; si un brute empieza herido (el campeón no se cura
    // entre peleas) se ajustan a su vida real antes del primer paso
    for (const f of fighters) {
      if (f.hpBar && f.hp < f.maxHp) updateHp(fighters, f, f.hp, speed, isClanWar, true);
    }

    // Loop on steps
    // Demo battle royale (todos contra todos)
    const isRoyale = !!(fight as unknown as { royale?: boolean }).royale;
    // Royale: sin bandos, cada uno vuelve a cualquier sitio despejado de la arena (no a su borde)
    royaleArena.enabled = isRoyale;
    // Royale: sin HUD superior (la vida de todos está en el panel lateral). Se oculta cada fotograma
    // porque los iconos de armas/habilidades se vuelven a crear al cambiar de duelo.
    hudControl.hidden = isRoyale;
    // Royale: zoom dinámico (si está activado): encuadra a los que siguen en pie (ver royaleCamera)
    const camera = isRoyale ? royaleCamera(app, () => fighters) : null;
    if (isRoyale) {
      const hideHud = () => {
        if (!app.stage || app.stage.destroyed) return;
        for (const child of app.stage.children) {
          if (isHudLayer(child.zIndex) && !fighters.some((f) => f.animation.container === child)) child.visible = false;
        }
      };
      hideHud();
      app.ticker.add(hideHud);
    }
    // Royale: lo que la interfaz lee y avisa (resaltado desde la lista, eliminaciones)
    const royaleFight = fight as unknown as {
      highlight?: number | null;
      onKill?: (kill: { victim: number; killer?: number; kind?: string }) => void;
    };
    // Royale: nombre, vida y victorias sobre cada brute, con el color de su fila en la lista
    const tags = isRoyale
      ? royaleTags(app, () => fighters, speed, () => royaleFight.highlight ?? null, () => camera?.view)
      : null;
    // Royale: varias eliminaciones seguidas del mismo brute → ¡MULTI KILL! (ver multiKill)
    const multiKill = isRoyale ? multiKills(app, speed) : null;
    // Royale: los que se mueven por su cuenta (se crea con el bucle de turnos en paralelo)
    let crowd: ReturnType<typeof royaleAmbient> | null = null;
    const royaleHud = {
      L: { hpBar: team1HpBar, hpBarPhantom: team1PhantomHpBar, bust: team1Bust, text: team1Text, weapons: team1Weapons, skills: team1Skills },
      R: { hpBar: team2HpBar ?? undefined, hpBarPhantom: team2PhantomHpBar ?? undefined, bust: team2Bust ?? undefined, text: team2Text ?? undefined, weapons: team2Weapons, skills: team2Skills },
    };
    const setRoyaleSide = (f: AnimationFighter, side: 'L' | 'R') => {
      if (f.team === side) return;
      f.team = side;
      // Mirar hacia el otro lado (los perros/pantera están dibujados al revés)
      const c = f.animation.container;
      const dog = f.type === 'pet' && (f.name.startsWith('dog') || f.name === 'panther');
      c.scale.x = Math.abs(c.scale.x || 1) * (side === 'L' ? 1 : -1) * (dog ? -1 : 1);
      if (f.type === 'brute' && !f.master) {
        const h = royaleHud[side];
        f.hpBar = h.hpBar;
        f.hpBarPhantom = h.hpBarPhantom;
        f.bust = h.bust;
        f.text = h.text;
        f.teamWeaponsIllustrations = h.weapons;
        f.teamSkillsIllustrations = h.skills;
        f.HUDFocused = false;
      }
    };
    // Royale: quién golpeó por última vez a cada uno (el que lo remate hará la fatality)
    const lastHitBy = new Map<number, number>();
    // Quién daña y a quién, en los pasos que quitan vida
    const damageOf = (step: FightStep) => {
      const s = step as unknown as { f?: number; b?: number; t?: number | number[] };
      const by = s.f ?? s.b;
      switch (step.a) {
        case StepType.Hit:
        case StepType.Poison:
        case StepType.FlashFlood:
        case StepType.Hammer:
        case StepType.Vampirism:
        case StepType.Haste:
        case StepType.Bomb:
        case 'demoFlood' as never: // Demo royale: golpes de las ultimates
        case 'demoBomb' as never:
        case 'demoHaste' as never:
        case 'demoCleaveHit' as never:
        case 'demoMinigunFire' as never:
          if (typeof by !== 'number') return null;
          return { by, targets: (Array.isArray(s.t) ? s.t : [s.t]).filter((t): t is number => typeof t === 'number') };
        default:
          return null;
      }
    };
    // Los que recibieron su último golpe de una ultimate: caen sin fatality (así no se alarga, con tantos a la vez)
    const ultimateVictims = new Set<number>();
    const ULTIMATE_HITS = new Set<unknown>(['demoFlood', 'demoBomb', 'demoHaste', 'demoCleaveHit']);
    // Pasos de ultimates que son efectos encima de los demás: no colocan a nadie de lado (quien la lanza puede estar a
    // mitad de otra cosa) ni se reserva para ellos a quien la lanza (ver involvedIn). La vida de un potenciador también
    // (ver demoBoost)
    const ULTIMATE_OVERLAYS = new Set<unknown>(['demoUltimate', 'demoFlood', 'demoBomb', 'demoCleaveHit', 'demoBoost']);
    const trackHit = (step: FightStep) => {
      const damage = damageOf(step);
      damage?.targets.forEach((t) => {
        lastHitBy.set(t, damage.by);
        if (ULTIMATE_HITS.has(step.a)) ultimateVictims.add(t);
        else ultimateVictims.delete(t);
      });
    };
    // Rematador de un brute eliminado en el royale: quien le dio el último golpe (si fue una mascota, su amo),
    // siempre que siga en pie, libre (sin red ni aturdir) y dentro del mismo turno que se está animando
    const royaleKiller = (victim: AnimationFighter, involved?: Set<number>) => {
      let killer = findFighter(fighters, lastHitBy.get(victim.index));
      if (killer?.master) killer = fighters.find((f) => f.id === killer?.master && !f.master);
      if (!killer || killer === victim || killer.type !== 'brute' || killer.master) return null;
      if (killer.dead || killer.hp <= 0 || killer.trapped || killer.stunned || !killer.animation.container.visible) return null;
      if (involved && !involved.has(killer.index)) return null;
      return killer;
    };

    // Royale: luchadores que se están animando en un turno (ver el planificador, más abajo)
    const busy = new Set<number>();
    // Royale: auras de ki encendidas (potenciadores 2 y 3)
    const kiAuras = new Map<number, KiAura>();
    // Royale: Súper gigantes (ultimate) y cuándo soltaron su última onda (una por ataque, aunque encadene golpes).
    // Alcanza a los más cercanos en ese momento, menos a quien ataca (ese ya se lleva su golpe), y a todos a la vez
    const stompers = new Map<number, number>();
    // Royale: cómo cancelar el final de cada Súper gigante (si vuelve a lanzarlo siendo gigante, su tiempo empieza de
    // nuevo)
    const giantEnds = new Map<number, () => void>();
    // Royale: miniguns del potenciador 3 y cómo cancelar el final de su tiempo (si le llega otra, vuelve a empezar)
    const miniguns = new Map<number, { gun: Minigun; cancel: () => void }>();
    // Royale: curaciones de potenciadores seguidos, que se agrupan (ver demoBoost): el número que las suma, cuándo se
    // vio la última y si quedaban más en cola. `boostsQueued`: si un brute tiene más potenciadores en cola (lo pone el
    // planificador, más abajo)
    const healGroups = new Map<number, { text: Text; total: number; at: number; more: boolean }>();
    let boostsQueued = (_index: number) => false;
    // Royale: luchadores cuya caída ya ha empezado a verse
    const dying = new Set<number>();
    // Royale: quién puede salvarse aún con un potenciador aunque en el motor ya haya caído: está en la arena y su caída
    // no ha empezado a verse (ver session.castBoost)
    (fight as unknown as { rescuable?: (index: number) => boolean }).rescuable = (index: number) => {
      const f = findFighter(fighters, index);
      return !!f && !f.dead && !dying.has(index) && f.animation.container.visible;
    };
    const stomp = (index: number, target?: number) => {
      const giant = findFighter(fighters, index);
      const last = stompers.get(index);
      if (last === undefined || !giant || giant.dead || giant.animation.container.destroyed) return;
      const now = performance.now();
      if (now - last < 1200 / speed.current) return;
      stompers.set(index, now);
      const g = giant.animation.container;
      // Lo vertical cuenta el doble: la arena es poco profunda
      const candidates = fighters
        .filter((f) => f !== giant && f.index !== target && f.type === 'brute' && !f.master && !f.dead && f.hp > 0
          && f.animation.container.visible && !f.animation.container.destroyed)
        .map((f) => ({ f, d: Math.hypot(f.animation.container.x - g.x, (f.animation.container.y - g.y) * 2) }))
        .sort((a, b) => a.d - b.d)
        .map(({ f }) => f.index);
      const hits = demoFight.cleave?.(index, candidates) ?? [];
      giantStomp(app, spritesheets, fighters, index, hits, speed, {
        // Libre: no está en ningún turno (si lo está, recibe el golpe sin pararlo). Mientras lo encaja no empieza otro
        free: (f) => !busy.has(f.index),
        hold: (f) => {
          busy.add(f.index);
          crowd?.release(f);
        },
        release: (f) => {
          busy.delete(f.index);
          demoFight.wake?.();
        },
      });
    };

    // Royale (duelos): a quién atacó cada uno por última vez, para retroceder frente a él (ver getDuelPosition)
    const duelFoe = new Map<number, number>();
    // Royale: sitios ya elegidos por los que están llegando a la vez
    const arrivalSpots: { x: number; y: number }[] = [];
    const royaleSides = (step: FightStep) => {
      const s = step as unknown as { f?: number; b?: number; t?: number; w?: number };
      if (step.a === StepType.End) {
        // Solo el ganador (y sus mascotas) celebran: el resto pasa al otro lado
        const w = findFighter(fighters, s.w);
        if (!w) return;
        fighters.forEach((f) => {
          if (f !== w && f.master !== w.id) setRoyaleSide(f, w.team === 'L' ? 'R' : 'L');
        });
        return;
      }
      const actor = findFighter(fighters, s.f ?? s.b);
      const target = findFighter(fighters, s.t);
      if (!actor || !target || actor === target) return;
      duelFoe.set(actor.index, target.index);
      const actorLeft = actor.animation.container.x <= target.animation.container.x;
      setRoyaleSide(actor, actorLeft ? 'L' : 'R');
      setRoyaleSide(target, actorLeft ? 'R' : 'L');
    };

    // Demo: los pasos pueden llegar poco a poco (pelea simulada turno a turno).
    // `liveSteps` crece cuando se llama a `pullSteps`, que juega el siguiente turno del motor.
    // `drained`: ya se animó todo lo anterior. En el royale, con uno solo en pie, devuelve null ("espera").
    // Royale: `finishing` es el botón "Finalizar" (cuenta atrás en la arena, ver royaleClock), `timeUp` que se acabó el
    // tiempo y `endNow` cierra la pelea con el ganador que se le diga. Ultimates (ver ultimates): `cleave` es la onda
    // de un Súper gigante (alcanza a los primeros de los que se le dan, devuelve a quiénes y cuánto les quita) y
    // `endGiant` se lo pasa; aquí se pone `wake` (hay pasos nuevos: botón de una ultimate)
    const demoFight = fight as unknown as {
      liveSteps?: FightStep[];
      pullSteps?: (drained?: boolean, hold?: (index: number) => boolean) => Promise<boolean | null>;
      finishing?: boolean;
      timeLeft?: number | null;
      timeUp?: boolean;
      endNow?: (winnerIndex: number) => boolean;
      cleave?: (index: number, candidates: number[]) => { t: number; d: number }[];
      endGiant?: (index: number) => boolean;
      endMinigun?: (index: number) => boolean;
      endPet?: (index: number) => boolean;
      wake?: () => void;
    };
    const steps = demoFight.liveSteps ?? (JSON.parse(fight.steps) as FightStep[]);
    // Procesa (anima) un paso. Extraído del bucle original para poder animar turnos en paralelo.
    // `involved`: luchadores reservados para el turno que se anima (royale con turnos en paralelo)
    const processStep = async (step: FightStep | undefined, i: number, involved?: Set<number>) => {

      if (!step) {
        throw new Error('Step not found');
      }

      currentStepIndex = i;
      currentStepName = StepType[step.a] ?? String(step.a);
      (globalThis as any).__fightStep = { i, name: currentStepName, step };
      (fight as unknown as { onStep?: (s: FightStep) => void }).onStep?.(step);
      if (step.a === StepType.Death) dying.add(step.f);

      // Demo battle royale: la animación solo tiene dos lados; antes de cada paso se coloca
      // a quien actúa y a su objetivo en lados opuestos (según dónde estén) y se les da ese HUD
      const overlay = ULTIMATE_OVERLAYS.has(step.a);
      if (isRoyale) {
        if (!overlay) royaleSides(step);
        trackHit(step);
      }

      // Reposition mispositionned fighters during neutral
      if (isRangedStep(step.a)) await repositionFighters(fighters, speed);

      // Display step's brute in HUD
      if (!overlay && 'b' in step && Object.hasOwn(step, 'b') && step.a !== StepType.AttemptHit) {
        void setHUDFocus(app, spritesheets, renderer, fighters, step.b, speed, isClanWar);
      }
      // Display step's fighter in HUD
      if (!overlay && 'f' in step && Object.hasOwn(step, 'f') && typeof step.f === 'number') {
        void setHUDFocus(app, spritesheets, renderer, fighters, step.f, speed, isClanWar);
      }
      // Display step's target in HUD
      if (!overlay && 't' in step && Object.hasOwn(step, 't')
        && step.a !== StepType.Bomb && step.a !== StepType.Hypnotise) {
        void setHUDFocus(app, spritesheets, renderer, fighters, step.t, speed, isClanWar);
      }

      switch (step.a) {
        case StepType.Move: {
          await moveTo(fighters, step, speed, app, spritesheets);
          break;
        }
        case StepType.MoveBack: {
          // Demo royale (duelos): retrocede frente a su rival si sigue en pie, no a otro sitio de la arena
          const mover = isRoyale ? findFighter(fighters, step.f) : undefined;
          const foe = mover ? findFighter(fighters, duelFoe.get(mover.index)) : undefined;
          const spot = mover && foe && !foe.dead && foe.animation.container.visible
            ? getDuelPosition(fighters, mover, foe)
            : undefined;
          await moveBack(fighters, step, speed, spot, app, spritesheets);
          break;
        }
        case StepType.Arrive: {
          await arrive(app, spritesheets, fighters, step, speed, isRoyale ? arrivalSpots : undefined);
          break;
        }
        case StepType.Leave: {
          await leave(fighters, step, speed);
          break;
        }
        case StepType.AttemptHit: {
          await attemptHit(app, spritesheets, fighters, step, speed);
          // Demo royale: el Súper gigante (ultimate) suelta su onda al atacar
          if (isRoyale) stomp(step.f, step.t);
          break;
        }
        case StepType.Hit:
        case StepType.Poison: {
          // Royale: un crítico sobresalta a los que miran cerca
          const struck = isRoyale && step.c ? findFighter(fighters, step.t) : undefined;
          if (struck) crowd?.react(struck.animation.container.x, struck.animation.container.y, 85, false);
          await hit(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.FlashFlood: {
          await flashFlood(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Hammer: {
          await hammer(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Death: {
          // Demo royale: cada brute eliminado cae con una fatality de quien lo remató, pero solo la animación
          // sobre los personajes (sin letreros, voz ni cámara): el resto de duelos sigue a la vez. En el duelo final
          // (no queda nadie más en pie) salen también los letreros y la voz
          if (isRoyale && isFatalityDeath(fighters, step)) {
            const victim = findFighter(fighters, step.f);
            const killer = victim && !ultimateVictims.has(victim.index) && royaleKiller(victim, involved);
            if (victim && killer) {
              // Con la minigun del potenciador +3000 en la mano, su propia fatality: la balacera. Le dispara desde donde
              // esté, así que la cámara le sigue encuadrando a su víctima hasta el final
              const held = miniguns.get(killer.index)?.gun;
              const gun = held && !held.removed ? held : undefined;
              const kind = gun ? 'balacera' : fatalityKind(killer);
              if (gun) camera?.framed.add(victim);
              await fatality(app, spritesheets, fighters, step, speed, {
                killer,
                final: fighters.every((f) => f === victim || f === killer || f.type !== 'brute' || f.master || f.dead),
                // En el golpe final, los que miran cerca reaccionan
                onImpact: () => crowd?.react(victim.animation.container.x, victim.animation.container.y, 150, true),
                kind,
                gun,
              }).finally(() => camera?.framed.delete(victim));
              // Queda mirando a su víctima: ese pasa a ser su lado, sin darse la vuelta de golpe
              if (!killer.animation.container.destroyed) setRoyaleSide(killer, killer.animation.container.scale.x >= 0 ? 'L' : 'R');
              royaleFight.onKill?.({ victim: victim.index, killer: killer.index, kind });
              tags?.win(killer.index);
              multiKill?.(killer);
              break;
            }
            // Sin fatality (quien lo remató ya no puede): se cuenta igual quién fue
            const by = findFighter(fighters, lastHitBy.get(step.f));
            const byBrute = by?.master ? fighters.find((f) => f.id === by.master) : by;
            royaleFight.onKill?.({ victim: step.f, killer: byBrute?.index });
            if (byBrute && byBrute.index !== step.f) {
              tags?.win(byBrute.index);
              multiKill?.(byBrute);
            }
          }
          // Demo royale: como en las guerras de clanes, los caídos se desvanecen para no llenar la arena
          death(fighters, step, speed, isClanWar || isRoyale);
          break;
        }
        case StepType.Evade: {
          await evade(fighters, step, speed, app, spritesheets);
          break;
        }
        case StepType.Saboteur: {
          await saboteur(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Disarm: {
          disarm(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Steal: {
          await steal(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Throw: {
          await throwWeapon(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Trash: {
          await trash(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Eat: {
          await eat(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Heal: {
          await heal(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Survive: {
          survive(fight, fighters, step, speed);
          break;
        }
        case StepType.Trap: {
          await trap(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Block: {
          await block(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.SkillActivate: {
          await skillActivate(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.SkillExpire: {
          await skillExpire(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.End: {
          end(app, spritesheets, fighters, step);
          break;
        }
        case StepType.Hypnotise: {
          await hypnotise(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Equip: {
          await equip(app, spritesheets, fighters, step);
          // Demo royale: con la minigun en las manos, la nueva se guarda con la suya (ver minigun.stash)
          miniguns.get(step.b)?.gun.stash();
          break;
        }
        case StepType.Sabotage: {
          sabotage(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Resist: {
          resist(fighters, step);
          break;
        }
        case StepType.Bomb: {
          await bomb(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Spy: {
          await spy(fighters, step, speed);
          break;
        }
        case StepType.Vampirism: {
          await vampirism(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Haste: {
          await haste(app, spritesheets, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Treat: {
          await treat(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.DropShield: {
          dropShield(app, spritesheets, fighters, step, speed);
          break;
        }
        case StepType.Regeneration: {
          await regenerate(app, fighters, step, speed, isClanWar);
          break;
        }
        case StepType.Counter: {
          // Do nothing for now
          break;
        }
        case StepType.Mimic: {
          await mimic(app, spritesheets, fighters, step, speed);
          break;
        }
        // Demo: compra de armas / power-ups en mitad de la pelea → actualizar el HUD
        case 'demoGear' as never: {
          const gearStep = step as unknown as {
            f: number;
            weapons: Partial<Record<number, number>>;
            skills: Partial<Record<number, number>>;
            // Usos exactos de los power-ups comprados para activar
            u?: Partial<Record<number, number>>;
          };
          const buyer = fighters.find((f) => f.index === gearStep.f);
          if (!buyer) break;
          for (const [weaponId, tier] of Object.entries(gearStep.weapons)) {
            buyer.weapons[+weaponId as keyof typeof buyer.weapons] = tier ?? 1;
          }
          updateWeapons(app, spritesheets, buyer);
          for (const [skillId, tier] of Object.entries(gearStep.skills)) {
            // 'add' muestra el icono entrando en grande, como cuando se gana una habilidad
            updateSkills(app, spritesheets, buyer, +skillId as SkillId, 'add', tier ?? 1, speed);
            const realUses = skills[SkillById[+skillId as SkillId]].uses?.[(tier ?? 1) - 1];
            const entry = buyer.skills[+skillId as SkillId];
            if (entry && realUses) entry.uses = realUses;
            const boughtUses = gearStep.u?.[+skillId];
            if (entry && boughtUses) entry.uses = boughtUses;
          }
          updateSkills(app, spritesheets, buyer);
          void sound.play('sfx', { sprite: 'equip' });
          break;
        }
        // Demo: mascota comprada (o brute agregado al royale) en mitad de la pelea → crear su animación
        // (luego llega con su paso Arrive)
        // Demo: poción comprada → el brute bebe y recupera vida (como la Poción trágica, sin gastar habilidad)
        case 'demoPotion' as never: {
          const potionStep = step as unknown as { b: number; h: number; c: number };
          const drinker = fighters.find((f) => f.index === potionStep.b);
          if (!drinker) break;
          const drinkEnded = drinker.animation.waitForEvent('drink:end');
          drinker.animation.setAnimation('drink');
          void sound.play('sfx', { sprite: 'tragicPotion' });
          displayHeal(app, drinker, potionStep.h, speed);
          await drinkEnded;
          updateHp(fighters, drinker, potionStep.h, speed, isClanWar);
          drinker.animation.setAnimation('idle');
          break;
        }
        // Demo royale: potenciador (ver engine/ultimates.boostHeal) → gana vida (lo que sobra sube su vida máxima).
        // Se ve al momento, esté como esté (ver splitUltimates): sube su vida y sale el número en verde, y si está
        // libre (y ni atrapado ni aturdido) bebe una poción. Antes esperaba a que quedara libre, y si estaba recibiendo
        // golpes de otro, caía antes de verse su cura. Con muchos seguidos bebe solo con el primero y el número pasa a
        // ser la suma de todos (mientras le queden más en cola o hasta HEAL_GROUP_SECONDS después del último)
        case 'demoBoost' as never: {
          const boostStep = step as unknown as { f: number; h: number; m: number };
          const drinker = findFighter(fighters, boostStep.f);
          if (!drinker || drinker.dead || drinker.animation.container.destroyed) break;
          drinker.maxHp = Math.max(drinker.maxHp, boostStep.m);
          // (si le salva de un golpe que ya se vio, lo que ese golpe quitó de más, ver updateHp)
          const owed = drinker as AnimationFighter & { demoOverkill?: number };
          const overkill = Math.min(owed.demoOverkill ?? 0, boostStep.h);
          owed.demoOverkill = (owed.demoOverkill ?? 0) - overkill;
          updateHp(fighters, drinker, boostStep.h - overkill, speed, isClanWar);
          const now = performance.now();
          const group = healGroups.get(drinker.index);
          if (group && (group.more || (now - group.at) * speed.current < HEAL_GROUP_SECONDS * 1000)) {
            group.total += boostStep.h;
            if (!group.text.destroyed) group.text.visible = false;
            group.text = displayHeal(app, drinker, group.total, speed);
            group.at = now;
            group.more = boostsQueued(drinker.index);
            break;
          }
          const text = displayHeal(app, drinker, boostStep.h, speed);
          healGroups.set(drinker.index, { text, total: boostStep.h, at: now, more: boostsQueued(drinker.index) });
          void sound.play('sfx', { sprite: 'tragicPotion' });
          // (atrapado en una red o aturdido en el suelo, no: sigue así)
          if (busy.has(drinker.index) || drinker.trapped || drinker.stunned) break;
          // Libre: bebe (y mientras, ni se mueve por su cuenta ni empieza otra cosa)
          busy.add(drinker.index);
          crowd?.release(drinker);
          // (la animación avanza por fotogramas: en un dispositivo lento no se espera más de esto)
          const drinkEnded = drinker.animation.waitForEvent('drink:end', 1500);
          drinker.animation.setAnimation('drink');
          await drinkEnded;
          busy.delete(drinker.index);
          if (!drinker.dead && !drinker.animation.container.destroyed) drinker.animation.setAnimation('idle');
          break;
        }
        // Demo royale: caída anulada (un potenciador le salvó antes de que se viera, ver session.castBoost)
        case 'demoRevived' as never:
          break;
        // Demo royale: minigun del potenciador 3 (ver minigun.ts): la saca y cuenta MINIGUN_SECONDS desde ese momento.
        // Si ya la llevaba, su tiempo vuelve a empezar
        case 'demoMinigun' as never: {
          const gunStep = step as unknown as { f: number };
          const brute = findFighter(fighters, gunStep.f);
          if (!brute || brute.dead || brute.animation.container.destroyed) break;
          const before = miniguns.get(brute.index);
          before?.cancel();
          const gun = before && !before.gun.removed ? before.gun : minigun(app, brute, speed);
          void sound.play('sfx', { sprite: 'equip' });
          const cancel = fightTimer(app, speed, MINIGUN_SECONDS, () => demoFight.endMinigun?.(brute.index));
          miniguns.set(brute.index, { gun, cancel });
          break;
        }
        // Demo royale: ráfaga de la minigun a un rival (ver fightMethods.minigunBurst): dispara y luego el rival encaja
        // el daño de toda la ráfaga
        case 'demoMinigunFire' as never: {
          const fireStep = step as unknown as { f: number; t: number; d: number; c?: number };
          const shooter = findFighter(fighters, fireStep.f);
          const target = findFighter(fighters, fireStep.t);
          if (!shooter || !target || shooter.animation.container.destroyed) break;
          let entry = miniguns.get(shooter.index);
          // (si no se llegó a ver cómo la sacaba, la saca ahora)
          if (!entry || entry.gun.removed) {
            entry = { gun: minigun(app, shooter, speed), cancel: () => {} };
            miniguns.set(shooter.index, entry);
          }
          await entry.gun.fire(target, 1.1);
          await struck(app, spritesheets, fighters, target, fireStep.d, speed, 14, !!fireStep.c);
          break;
        }
        // Demo royale: se acaba la minigun (ver engine/ultimates.endMinigun): la suelta y vuelve a su arma
        case 'demoMinigunEnd' as never: {
          const endStep = step as unknown as { f: number };
          const entry = miniguns.get(endStep.f);
          entry?.cancel();
          entry?.gun.drop();
          miniguns.delete(endStep.f);
          break;
        }
        // Demo royale: potenciador 2 o 3 → aura de ki (daño x3 en el motor) para el resto de la pelea. Si ya la tenía,
        // vuelve a estallar (y si era la del 2 y este es el 3, pasa a la de rayos)
        case 'demoKi' as never: {
          const kiStep = step as unknown as { f: number; n: number };
          const brute = findFighter(fighters, kiStep.f);
          if (!brute || brute.dead || brute.animation.container.destroyed) break;
          const before = kiAuras.get(brute.index);
          if (before && !before.stopped && before.tier >= kiStep.n) {
            before.pulse();
            break;
          }
          before?.stop();
          kiAuras.set(brute.index, kiAura(app, brute, speed, kiStep.n));
          break;
        }
        // Demo royale: mascota del potenciador 3 → pelea un minuto desde que llega y luego se va (ver endPet)
        case 'demoPet' as never: {
          const petStep = step as unknown as { f: number };
          fightTimer(app, speed, PET_SECONDS, () => demoFight.endPet?.(petStep.f));
          break;
        }
        // Demo: Súper gigante → el brute crece (daño x2 y resistencia x2 en el motor)
        case 'demoGiant' as never: {
          const giantStep = step as unknown as { f: number; u?: 1 };
          const giant = fighters.find((f) => f.index === giantStep.f);
          if (!giant) break;
          void sound.play('sfx', { sprite: 'fierceBrute' });
          void shakeStage(app, speed, 4, 600);
          // Como ultimate del royale ya lleva su letrero arriba (ver ultimateCast)
          const label = new Text({
            text: '¡SÚPER GIGANTE!',
            style: { fontFamily: 'GameFont', fontSize: 16, fill: 0xffd23f, stroke: { color: 0x3a1a00, width: 4 } },
          });
          label.anchor.set(0.5);
          label.position.set(giant.animation.container.x, Math.max(30, giant.animation.container.y - giant.animation.baseHeight * GIANT_SCALE * 1.1));
          label.zIndex = 950;
          label.visible = !giantStep.u;
          app.stage?.addChild(label);
          void tween(label, { y: label.y - 25, alpha: 0, duration: 1.6 / speed.current, delay: 0.6 / speed.current, ease: 'power1.in' })
            .then(() => label.destroy());
          const grow = { s: giant.animation.giantScale };
          await tween(grow, {
            s: GIANT_SCALE,
            duration: 0.8 / speed.current,
            ease: 'elastic.out(1, 0.5)',
            onUpdate: () => giant.animation.setGiantScale(grow.s),
          });
          giant.animation.setGiantScale(GIANT_SCALE);
          // Como ultimate dura unos segundos desde que crece, y mientras suelta su onda al atacar
          if (giantStep.u) {
            stompers.set(giant.index, 0);
            giantEnds.get(giant.index)?.();
            giantEnds.set(
              giant.index,
              giantTimer(app, speed, () => {
                giantEnds.delete(giant.index);
                stompers.delete(giant.index);
                demoFight.endGiant?.(giant.index);
              }),
            );
          }
          break;
        }
        // Demo royale: ultimates (ver ultimates)
        case 'demoUltimate' as never: {
          ultimateCast(app, fighters, step as never, speed);
          break;
        }
        case 'demoFlood' as never: {
          await ultimateFlood(app, spritesheets, fighters, step as never, speed, involved);
          break;
        }
        case 'demoBomb' as never: {
          await ultimateBomb(app, spritesheets, fighters, step as never, speed, involved);
          break;
        }
        case 'demoHaste' as never: {
          await ultimateHaste(app, spritesheets, fighters, step as never, speed);
          break;
        }
        case 'demoCleaveHit' as never: {
          await ultimateCleaveHit(app, spritesheets, fighters, step as never, speed, involved);
          break;
        }
        case 'demoGiantEnd' as never: {
          await giantShrink(app, spritesheets, fighters, step as never, speed);
          break;
        }
        case 'demoSpawn' as never: {
          const spawn = (step as unknown as { fighter: Fighter }).fighter;
          const teammate = fighters.find((f) => f.team === spawn.team && !f.master);
          const newcomer: AnimationFighter = {
            ...spawn,
            hpBar: undefined,
            hpBarPhantom: undefined,
            bustImage: null,
            bust: undefined,
            text: undefined,
            teamWeaponsIllustrations: teammate?.teamWeaponsIllustrations ?? [],
            teamSkillsIllustrations: teammate?.teamSkillsIllustrations ?? [],
            HUDFocused: false,
            skills: animationSkills(spawn),
            animation: new FighterHolder(app, spawn, speed, spawn.size),
          };
          newcomer.animation.container.x = spawn.team === 'L' ? -100 : 600;
          newcomer.animation.container.y = 150;
          app.stage?.addChild(newcomer.animation.container);
          fighters.push(newcomer);
          while (!shouldAbort() && !newcomer.animation.loaded) {
            await new Promise((resolve) => { setTimeout(resolve, 50); });
          }
          break;
        }
        default:
          console.error('Unknown step', step);
          break;
      }

    };

    if (!isRoyale) {
      repositionControl.disabled = false;
      for (let i = 0; ; i++) {
        if (shouldAbort()) return;

        // Sin pasos pendientes: pedir el siguiente turno (o terminar)
        while (i >= steps.length && demoFight.pullSteps) {
          if (!(await demoFight.pullSteps())) break;
          if (shouldAbort()) return;
        }
        if (i >= steps.length) break;

        await processStep(steps[i], i);
        if (shouldAbort()) return;
      }
    } else {
      // Demo battle royale: varios turnos a la vez. Cada turno del motor (sus pasos, en orden) se anima
      // en paralelo con otros turnos siempre que no compartan luchadores. En el motor cada brute pelea solo con
      // los de su grupo (duelos en pareja o trío, ver royaleGroup), así que todos los duelos pueden ir a la vez.
      // Solo paran la arena el fin, el saboteador del principio y la hipnosis (fotografía toda la escena).
      repositionControl.disabled = true;
      // Sin tope práctico: antes eran 6 duelos a la vez y el resto esperaba su turno
      const MAX_PARALLEL = 64;
      const exclusiveTypes = new Set<number>([StepType.Hypnotise, StepType.Saboteur, StepType.End, StepType.Spy]);
      // Tope de turnos en cola: uno por cada uno en pie. Casi nunca se llega: cada duelo solo pide su siguiente turno
      // cuando acaba de verse el anterior (ver `unseen`). Antes era lo único que frenaba al motor (y con un mínimo de 16,
      // si quedaban pocos, un brute agregado esperaba unos 25 s para pelear)
      const lookahead = () => Math.max(2, fighters.filter((f) => !f.dead).length);
      // Las llegadas del principio van escalonadas (sin parar nada): cada uno salta este tiempo después del anterior
      const ARRIVAL_STAGGER = 0.12;
      const isStartStep = (st: FightStep) => st.a === StepType.Arrive || st.a === StepType.Saboteur || st.a === StepType.Spy;
      // Brute agregado en plena pelea: aparece (demoSpawn) y llega (Arrive)
      const isSpawnStep = (st: FightStep) => (st.a as unknown) === 'demoSpawn' || st.a === StepType.Arrive;
      const involvedIn = (chunk: FightStep[]) => {
        const set = new Set<number>();
        for (const st of chunk) {
          // Claves con luchadores (`p`: mascotas afectadas). `w` es el arma (o el ganador, en el paso final,
          // que va solo): contarla reservaba al luchador con ese número sin motivo y frenaba los duelos en paralelo
          for (const key of ['f', 't', 'b', 'p']) {
            // En AttemptHit `b` es "escudo roto" (0/1) y en Mimic `t` es el nivel de la habilidad. En los efectos de
            // las ultimates (letrero, lo que cae del cielo, la onda del gigante) `f` es quien la lanza: sigue a lo suyo
            if ((key === 'b' && st.a === StepType.AttemptHit) || (key === 't' && st.a === StepType.Mimic)
              || (key === 'f' && ULTIMATE_OVERLAYS.has(st.a))) continue;
            const v = (st as unknown as Record<string, unknown>)[key];
            if (typeof v === 'number') set.add(v);
            else if (Array.isArray(v)) v.forEach((x) => { if (typeof x === 'number') set.add(x); });
          }
        }
        // Las mascotas ya no arrastran a su amo (ni al revés): ningún paso anima a quien no nombra, y así
        // amo y mascota pueden pelear en duelos distintos a la vez. Excepción: si en el turno cae un brute
        // rematado por una mascota, la fatality la hace su amo, así que también se le reserva
        const lastHit = new Map<number, number>();
        for (const st of chunk) {
          const damage = damageOf(st);
          damage?.targets.forEach((t) => lastHit.set(t, damage.by));
          if (st.a !== StepType.Death) continue;
          const by = findFighter(fighters, lastHit.get(st.f));
          const master = by?.master ? fighters.find((x) => x.id === by.master && !x.master) : undefined;
          if (master) set.add(master.index);
        }
        return set;
      };
      const running = new Set<Promise<void>>();
      (globalThis as any).__royaleBusy = busy; // depuración: luchadores que se están animando en un turno
      let cursor = 0;
      // Los que no están en ningún duelo se mueven por su cuenta (ver royaleAmbient)
      const ambient = royaleAmbient(app, spritesheets, () => fighters, speed, (f) => busy.has(f.index), () => camera?.view);
      crowd = ambient;
      // Reloj de "Finalizar" arriba en la arena: la ronda solo termina cuando llega a cero
      royaleClock(app, demoFight);
      // Cola de turnos ya simulados por el motor (ver `lookahead`): se lanza cualquier turno que no comparta
      // luchadores con lo que se está animando ni con turnos anteriores aún en cola, así cada luchador conserva
      // el orden de sus acciones.
      // Ultimates (ver ultimates): alcanzan a muchos a la vez y, si fueran un solo turno, no se verían hasta que todos
      // acabaran lo que tenían en cola. Así que cada golpe (y la caída de quien muera por él) va en su propia pieza, que
      // solo espera a su objetivo y a que salga su letrero: `after` es esa señal y `signal`, el paso que la da.
      // `extra`: pieza que no es un turno del motor (no cuenta para `lookahead`).
      // `jump`: puede ir antes que lo que sus luchadores tengan en cola (en cuanto queden libres): las embestidas de la
      // Prisa (da igual en qué orden recibe cada uno sus golpes, la vida que le quitan es la misma) y que el Súper
      // gigante crezca o encoja (solo se ve). `overlay`: lo que cae del cielo y la onda que remata: sale a su hora
      // aunque sus objetivos estén ocupados (estos lo reciben sin pararse, `light`). `finisher`: la caída de quien
      // muere por una ultimate: en cuanto queda libre, lo que tuviera antes en cola se da por visto (sin animarlo, solo
      // se ajusta la vida, ver `skip`), así los que caen a la vez caen casi juntos. `killer`: quien le remató (la
      // ultimate es suya aunque lo último que se viera fuera otro golpe de lo que ya estaba animándose).
      // `owner`: el de la Prisa en cadena, que no hace otra cosa mientras le queden embestidas, aunque estas pueden ir
      // en otro orden (a por el primero que quede libre). `timing`: espera al letrero y entre golpes seguidos, y cuál
      // es este. `indices`: número de cada paso (si no van seguidos)
      type Signal = { reached: boolean; at: number };
      type QueuedTurn = {
        chunk: FightStep[]; start: number; involved: Set<number>; exclusive: boolean; delay?: number;
        extra?: boolean; after?: Signal; signal?: { step: FightStep; token: Signal }; jump?: boolean;
        overlay?: boolean; light?: number[]; finisher?: Set<number>; killer?: number; owner?: number;
        timing?: [number, number, number]; indices?: number[];
      };
      const queue: QueuedTurn[] = [];
      (globalThis as any).__royaleQueue = queue; // depuración: lo que espera a animarse
      boostsQueued = (index: number) => queue.some((q) => q.chunk
        .some((st) => (st.a as unknown) === 'demoBoost' && (st as unknown as { f: number }).f === index));
      // Royale: quien está en un turno que aún se está viendo o tiene algo en cola. El motor no le juega otro turno
      // hasta que quede libre (ver session.playTurn): así ningún duelo va por delante de lo que se ve, y el siguiente
      // turno se juega en el momento en que hace falta. Antes el motor se adelantaba hasta llenar la cola y en el duelo
      // más lento se acumulaban hasta 7 turnos: en un royale de 10, uno de cada cinco brutes en pie en pantalla ya
      // había caído en el motor, y si se pulsaba su ultimate, el motor no la aceptaba y se quedaba en cola
      const unseen = (index: number) => busy.has(index) || queue.some((q) => q.involved.has(index));
      let engineDone = false;
      // Despierta al bucle de abajo cuando sale una señal o llegan pasos nuevos (botón de una ultimate)
      let nudge = () => {};
      const nudged = () => new Promise<void>((resolve) => { nudge = () => resolve(); });
      demoFight.wake = () => nudge();
      const fire = (token: Signal) => {
        if (token.reached) return;
        token.reached = true;
        token.at = performance.now();
        nudge();
      };
      const runChunk = async (turn: QueuedTurn) => {
        if (turn.delay && turn.delay > 0) await tween({ t: 0 }, { t: 1, duration: turn.delay / speed.current });
        for (let k = 0; k < turn.chunk.length; k++) {
          if (shouldAbort()) return;
          const step = turn.chunk[k]!;
          if (turn.signal?.step === step) fire(turn.signal.token);
          await processStep(step, turn.indices?.[k] ?? turn.start + k, turn.involved);
        }
      };
      // Reserva a los luchadores de un turno: dejan al instante lo que hicieran por su cuenta
      const reserve = (involved: Set<number>) => involved.forEach((x) => {
        busy.add(x);
        ambient.release(findFighter(fighters, x));
      });
      // Golpes seguidos de una serie: cuánto falta (s) para su hora, que cuenta desde el letrero
      const dueIn = (turn: QueuedTurn) => {
        if (!turn.timing || !turn.after) return 0;
        const [first, gap, k] = turn.timing;
        return first + gap * k - ((performance.now() - turn.after.at) / 1000) * speed.current;
      };
      // Quienes están recibiendo un golpe sin pararse (`light`): su caída espera a que acabe
      const hitting = new Map<number, number>();
      const launch = (turn: QueuedTurn) => {
        turn.delay = Math.max(turn.delay ?? 0, dueIn(turn));
        const { killer } = turn;
        if (killer !== undefined) {
          turn.finisher?.forEach((v) => {
            lastHitBy.set(v, killer);
            ultimateVictims.add(v);
          });
        }
        reserve(turn.involved);
        turn.light?.forEach((x) => hitting.set(x, (hitting.get(x) ?? 0) + 1));
        const p: Promise<void> = runChunk(turn)
          .catch(console.error)
          .finally(() => {
            // Si no llegó a dar su señal (algo falló), lo que espera por ella no se queda colgado
            if (turn.signal) fire(turn.signal.token);
            turn.involved.forEach((x) => busy.delete(x));
            turn.light?.forEach((x) => hitting.set(x, (hitting.get(x) ?? 1) - 1));
            running.delete(p);
          });
        running.add(p);
      };
      // Despertar al bucle cuando le llega la hora al próximo golpe (el más cercano)
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timerAt = Infinity;
      const wakeIn = (seconds: number) => {
        const at = performance.now() + (seconds * 1000) / speed.current;
        if (timer !== undefined && at >= timerAt) return;
        clearTimeout(timer);
        timerAt = at;
        timer = setTimeout(() => {
          timer = undefined;
          timerAt = Infinity;
          nudge();
        }, Math.max(10, at - performance.now()));
      };
      // Lo que un paso cambia la vida a cada uno, para darlo por visto sin animarlo (ver `finisher`)
      const hpChanges = (st: FightStep): [number, number][] => {
        const s = st as unknown as { b?: number; f?: number; t?: number | number[]; d?: unknown; h?: number };
        const by = (t: number) => (s.d && typeof s.d === 'object' ? (s.d as Record<number, number>)[t] ?? 0 : 0);
        switch (st.a) {
          case StepType.Hit:
          case StepType.Poison:
          case StepType.FlashFlood:
          case StepType.Hammer:
          case StepType.Haste:
          case 'demoFlood' as never:
          case 'demoHaste' as never:
          case 'demoCleaveHit' as never:
          case 'demoMinigunFire' as never:
            return typeof s.t === 'number' && typeof s.d === 'number' ? [[s.t, -s.d]] : [];
          case StepType.Bomb:
          case 'demoBomb' as never:
            return Array.isArray(s.t) ? s.t.map((t) => [t, -by(t)]) : [];
          case StepType.Vampirism:
            return [[s.t as number, -(s.d as number)], [s.b as number, s.h ?? 0]];
          case StepType.Heal:
          case StepType.Eat:
            return [[s.b as number, s.h ?? 0]];
          case StepType.Regeneration:
            return [[s.f as number, s.h ?? 0]];
          default:
            return [];
        }
      };
      // Da por visto lo que el que cae (`finisher` de `turn`) tenía en cola antes que su caída, salvo los golpes de
      // ultimates. No se puede si en eso cae alguien o para la arena (entonces cae en su turno)
      const fastForward = (turn: QueuedTurn) => {
        const at = queue.indexOf(turn);
        const earlier = queue.slice(0, at).filter((e) => !e.extra
          && [...e.involved].some((x) => turn.finisher?.has(x)));
        if (earlier.some((e) => e.exclusive || e.chunk.some((st) => st.a === StepType.Death))) return false;
        earlier.forEach((e) => {
          queue.splice(queue.indexOf(e), 1);
          skip(e);
        });
        return true;
      };
      const skip = (turn: QueuedTurn) => {
        for (const st of turn.chunk) {
          for (const [index, change] of hpChanges(st)) {
            const f = findFighter(fighters, index);
            if (f && change) updateHp(fighters, f, change, speed, false);
          }
          const survivor = st.a === StepType.Survive ? findFighter(fighters, st.b) : undefined;
          if (survivor) updateHp(fighters, survivor, 1, speed, false, true);
        }
      };
      // Golpes de ultimates (ver arriba) y cuánto esperan al letrero y entre uno y otro (segundos)
      const SERIES_STEPS = new Set<unknown>(['demoFlood', 'demoBomb', 'demoHaste', 'demoCleaveHit']);
      const SERIES_TIMING: Record<string, [number, number]> = { demoFlood: [0.45, 0.2], demoBomb: [0.45, 0.38] };
      // Reparte en piezas un trozo con ultimates (lanzadas con su botón, o que el Súper gigante crezca o encoja).
      // Null si no tiene
      const splitUltimates = (chunk: FightStep[], from: number): QueuedTurn[] | null => {
        const visual = (st: FightStep) => (st.a as unknown) === 'demoGiant' || (st.a as unknown) === 'demoGiantEnd';
        const ultimate = (st: FightStep) => (st.a as unknown) === 'demoUltimate' || SERIES_STEPS.has(st.a) || visual(st);
        if (!chunk.some(ultimate)) return null;
        type Item = { st: FightStep; i: number };
        const piece = (items: Item[], extra: Partial<QueuedTurn>): QueuedTurn => ({
          chunk: items.map((x) => x.st),
          start: items[0]!.i,
          indices: items.map((x) => x.i),
          involved: involvedIn(items.map((x) => x.st)),
          exclusive: false,
          extra: true,
          ...extra,
        });
        // Golpeados por la ultimate y quién les dio el último golpe
        const victims = new Map<number, number>();
        chunk.forEach((st) => {
          const damage = SERIES_STEPS.has(st.a) ? damageOf(st) : null;
          damage?.targets.forEach((t) => victims.set(t, damage.by));
        });
        // (si alguno aún no ha llegado a la arena, todo en orden: después de llegar)
        const arrived = (t: number) => !!findFighter(fighters, t)?.animation.container.visible;
        const heads: QueuedTurn[] = [];
        const tail: QueuedTurn[] = [];
        const main: Item[] = [];
        let token: Signal = { reached: true, at: performance.now() };
        // Lo que el motor pone delante de un golpe (resiste) va con él
        let before: Item[] = [];
        chunk.forEach((st, n) => {
          const item = { st, i: from + n };
          const a = st.a as unknown;
          if (st.a === StepType.Resist) {
            before.push(item);
            return;
          }
          if (SERIES_STEPS.has(a)) {
            const s = st as unknown as { k?: number; b?: number };
            const timing = SERIES_TIMING[a as string];
            const ready = (damageOf(st)?.targets ?? []).every(arrived);
            tail.push(piece([...before, item], {
              after: token,
              jump: ready && a === 'demoHaste',
              overlay: ready && a !== 'demoHaste',
              owner: a === 'demoHaste' ? s.b : undefined,
              timing: timing && [timing[0], timing[1], s.k ?? 0],
            }));
            before = [];
            return;
          }
          main.push(...before);
          before = [];
          const last = tail[tail.length - 1];
          // Sobrevive a un golpe (con 1 PV): va con ese golpe
          if (st.a === StepType.Survive && last?.involved.has(st.b)) {
            last.chunk.push(st);
            last.indices?.push(item.i);
          } else if (st.a === StepType.Death && victims.has(st.f)) {
            tail.push(piece([item], { finisher: arrived(st.f) ? new Set([st.f]) : undefined, killer: victims.get(st.f) }));
          } else if (a === 'demoBoost') {
            // La vida de un potenciador: sola y al momento, sin esperar a nadie (ver demoBoost)
            heads.push(piece([item], { jump: true }));
          } else if (a === 'demoUltimate') {
            // Su letrero: no espera a nadie y da la señal a sus golpes
            token = { reached: false, at: 0 };
            heads.push(piece([item], { signal: { step: st, token } }));
          } else {
            main.push(item);
          }
        });
        main.push(...before);
        // El resto va junto: lo que el motor pusiera aparte de los golpes, o que el gigante crezca o encoja (solo se
        // ve, ver `jump`)
        if (main.length) {
          const look = main.every((x) => visual(x.st));
          heads.push(piece(main, {
            extra: look || chunk.some((st) => (st.a as unknown) === 'demoUltimate'),
            exclusive: main.some((x) => exclusiveTypes.has(x.st.a)),
            jump: look,
          }));
        }
        return [...heads, ...tail];
      };
      let timeOver = false;
      // Nadie en pie (los últimos cayeron a la vez): ya no puede entrar nadie, se cierra como al acabarse el tiempo
      let nobodyLeft = false;
      const standing = () => fighters
        .filter((f) => f.type === 'brute' && !f.master && !f.dead && f.hp > 0 && f.animation.container.visible);
      for (;;) {
        if (shouldAbort()) return;
        // Fin por tiempo (el reloj de "Finalizar" llegó a cero): lo que el motor jugó y aún no se vio no cuenta. Se
        // termina lo que está en pantalla y gana quien más victorias lleva de los que siguen en pie (a igualdad, el
        // que tiene más vida); si solo queda uno, él
        if ((demoFight.timeUp || nobodyLeft) && !timeOver && !fight.winner) {
          timeOver = true;
          queue.length = 0;
          cursor = steps.length;
          await Promise.all(running);
          if (shouldAbort()) return;
          // Ultimates a medias (sus golpes ya no se ven): fuera sus efectos
          clearUltimates();
          const score = (f: AnimationFighter) => (tags?.winsOf(f.index) ?? 0) + f.hp / f.maxHp / 2;
          const alive = standing();
          // Si no queda nadie en pie, gana el que más victorias lleve
          const best = (alive.length ? alive : fighters.filter((f) => f.type === 'brute' && !f.master))
            .sort((a, b) => score(b) - score(a))[0];
          if (best) demoFight.endNow?.(best.index);
        }
        // Rellenar la cola con los siguientes turnos del motor (los pasos que ya están, como los de una ultimate recién
        // lanzada, se cogen siempre)
        let waiting = false;
        while (!engineDone && !queue.some((q) => q.exclusive)) {
          if (cursor >= steps.length) {
            if (queue.filter((q) => !q.extra).length >= lookahead()) break;
            // Cuando queda uno en pie, el motor no cierra la pelea hasta que aquí se ha visto todo (null = todavía no),
            // así se pueden seguir agregando brutes mientras quedan duelos en pantalla. También es null si todos
            // esperan a que acabe de verse su turno anterior (ver `unseen`)
            const more = demoFight.pullSteps
              ? await demoFight.pullSteps(!queue.length && !running.size, isRoyale ? unseen : undefined)
              : false;
            if (more === null) { waiting = true; break; }
            if (!more && cursor >= steps.length) { engineDone = true; break; }
            if (cursor >= steps.length) continue;
          }
          const chunk = steps.slice(cursor);
          const ultimate = splitUltimates(chunk, cursor);
          if (ultimate) {
            queue.push(...ultimate);
            // Los que caen por ella ya no siguen con lo que tenían en cola (se da por visto): así caen en cuanto
            // acaban lo que están animando y les llegan sus golpes
            ultimate.forEach((turn) => turn.finisher && fastForward(turn));
            cursor = steps.length;
            continue;
          }
          // Las llegadas del principio vienen todas juntas: van por separado, así cada uno queda libre (y se mueve
          // por su cuenta o empieza su duelo) en cuanto aterriza en vez de esperar al último. Lo mismo con varios
          // brutes agregados a la vez (+5): cada uno aparece y llega por su cuenta
          let pieces = [chunk];
          if (chunk.length > 1 && chunk.every(isStartStep)) pieces = chunk.map((st) => [st]);
          else if (chunk.length > 2 && chunk.every(isSpawnStep)) {
            pieces = [];
            for (const st of chunk) {
              if (st.a !== StepType.Arrive || !pieces.length) pieces.push([st]);
              else pieces[pieces.length - 1]!.push(st);
            }
          }
          let start = cursor;
          let arrivals = 0;
          for (const piece of pieces) {
            const arrival = pieces.length > 1 && piece.some((st) => st.a === StepType.Arrive);
            queue.push({
              chunk: piece,
              start,
              involved: involvedIn(piece),
              exclusive: piece.some((st) => exclusiveTypes.has(st.a)),
              delay: arrival ? ARRIVAL_STAGGER * arrivals++ : 0,
            });
            start += piece.length;
          }
          cursor = steps.length;
        }
        if (!queue.length && !running.size) {
          // Ya se vio todo y queda uno solo en pie: espera (haciendo el tonto, ver royaleAmbient) a que entre alguien
          // o a que el reloj de "Finalizar" llegue a cero
          if (waiting) {
            if (!standing().length) nobodyLeft = true;
            else await new Promise((resolve) => { setTimeout(resolve, 150); });
            continue;
          }
          break;
        }

        // Lanzar todo lo que se pueda: primero lo que va por delante (ver `jump`, `overlay` y `finisher`), luego en orden
        let launched = false;
        // Objetivos de una Prisa en cadena que solo espera a que quede libre quien la lanza: le esperan sin empezar
        // otra cosa (si no, cuando él quedara libre ellos podrían estar a mitad de un turno)
        const claimed = new Set<number>();
        // (nada pasa por delante de una barrera: solo lo que está antes de ella)
        for (let q = 0; q < queue.length && !queue[q]!.exclusive; q++) {
          const turn = queue[q]!;
          // (si quien caía se salvó con un potenciador, ya no remata a nadie: ver session.castBoost)
          if (turn.finisher && !turn.chunk.some((st) => st.a === StepType.Death)) turn.finisher = undefined;
          if ((!turn.jump && !turn.overlay && !turn.finisher) || (turn.after && !turn.after.reached)
            || running.size >= MAX_PARALLEL) continue;
          const { finisher } = turn;
          if (turn.overlay) {
            // A su hora, estén como estén sus objetivos: los libres lo encajan (se reservan) y los demás, sin pararse
            const left = dueIn(turn);
            if (left > 0.02) {
              wakeIn(left);
              continue;
            }
            turn.light = [...turn.involved].filter((x) => busy.has(x));
            turn.involved = new Set([...turn.involved].filter((x) => !busy.has(x)));
          } else {
            const waits = [...turn.involved].filter((x) => busy.has(x) || (finisher && hitting.get(x)));
            if (waits.length) {
              if (waits.every((x) => x === turn.owner)) {
                turn.involved.forEach((x) => { if (x !== turn.owner) claimed.add(x); });
              }
              continue;
            }
          }
          if (finisher) {
            // Antes, los golpes de ultimates que aún tenga en cola; si quedara algo más, se intenta dar por visto
            const earlier = queue.slice(0, q).filter((e) => [...e.involved].some((x) => finisher.has(x)));
            if (earlier.some((e) => e.extra) || !fastForward(turn)) continue;
            q = queue.indexOf(turn);
          }
          queue.splice(q, 1);
          q -= 1;
          launch(turn);
          launched = true;
        }
        const blocked = new Set<number>();
        // El de una Prisa en cadena con embestidas aún en cola: solo puede seguir con las de esa serie (aunque tuviera
        // otras cosas antes en cola, si alguna embestida puede adelantarse)
        const held = new Map<number, Signal | undefined>();
        for (const q of queue) if (q.owner !== undefined && q.jump && !held.has(q.owner)) held.set(q.owner, q.after);
        for (let q = 0; q < queue.length; q++) {
          const turn = queue[q]!;
          if (turn.exclusive) {
            // Barrera: solo cuando no queda nada en marcha ni nada antes en la cola
            if (q === 0 && !running.size) {
              queue.shift();
              // En el último turno (el del fin) ya nadie se mueve por su cuenta. En el resto (llegadas, bombas…)
              // solo se para a los afectados: los demás siguen a lo suyo
              const last = turn.chunk.some((st) => st.a === StepType.End);
              if (last) ambient.stop();
              else reserve(turn.involved);
              await runChunk(turn);
              if (!last) turn.involved.forEach((x) => busy.delete(x));
              launched = true;
            }
            break;
          }
          const free = running.size < MAX_PARALLEL && !turn.overlay
            && (!turn.after || turn.after.reached)
            && ![...turn.involved].some((x) => busy.has(x) || blocked.has(x) || claimed.has(x)
              || (turn.finisher && hitting.get(x)) || (held.has(x) && held.get(x) !== turn.after));
          if (free) {
            queue.splice(q, 1);
            q -= 1;
            launch(turn);
            launched = true;
          } else {
            turn.involved.forEach((x) => {
              if (x !== turn.owner) blocked.add(x);
              else if (!held.has(x)) held.set(x, turn.after);
            });
          }
        }
        if (!launched) {
          // A esperar a que acabe algo, salga la señal de una ultimate o se lance otra (sin nada en marcha, poco)
          await Promise.race([
            ...running,
            nudged(),
            ...(running.size ? [] : [new Promise((resolve) => { setTimeout(resolve, 150); })]),
          ]);
        }
      }
      await Promise.all(running);
      ambient.stop();
      repositionControl.disabled = false;
      if (shouldAbort()) return;
    }

    void sound.play('sfx', { sprite: 'win' });

    // Get winner fighter
    const winner = fighters.find((fighter) => !fighter.master && isWinner(fighter, fight));

    // Get loser fighter
    const loser = fighters.find((fighter) => !fighter.master && isLoser(fighter, fight));

    // Display dead icon animation on the UI
    const deadIcon = new AnimatedSprite(miscSheet.animations.dead ?? []);
    deadIcon.visible = !isRoyale;
    deadIcon.filters = [new OutlineFilter()];
    deadIcon.loop = false;
    deadIcon.animationSpeed = 0.5;
    deadIcon.zIndex = 1000;
    deadIcon.eventMode = 'none';
    if (loser?.team === 'R') {
      deadIcon.scale.x = -1;
      if (team2Header) {
        deadIcon.x = team2Header.x + 32;
        deadIcon.y = team2Header.y - 13;
      } else if (bossHeader) {
        deadIcon.x = bossHeader.x + 32;
        deadIcon.y = bossHeader.y - 13;
      }
    } else {
      deadIcon.x = team1Header.x - 32;
      deadIcon.y = team1Header.y - 13;
    }
    app.stage?.addChild(deadIcon);
    deadIcon.play();

    // Display win message at the bottom
    const winMessage = new Text({
      text: t('fight.wonTheFight', { brute: fight.winner }).toLocaleUpperCase(),
      style: {
        fontFamily: 'GameFont',
        fontSize: 20,
        fill: 0xffffff,
        align: 'center',
      }
    });
    winMessage.filters = [new OutlineFilter()];
    winMessage.x = app.screen.width / 2;
    winMessage.y = app.screen.height - 20;
    winMessage.anchor.set(0.5, 0.5);
    winMessage.height = 0;
    winMessage.zIndex = 900;
    app.stage?.addChild(winMessage);

    // Animate win message
    tween(winMessage, {
      duration: 2 / speed.current,
      height: 30,
      ease: 'bounce',
    });

    // Make 50 petals fall on the winner
    currentStepName = 'postFight';
    currentStepIndex = steps.length;
    let completedPetals = 0;
    for (let i = 0; i < 50; i++) {
      const petal = new AnimatedSprite(miscSheet.animations.petals ?? []);
      petal.filters = [new ColorOverlayFilter({
        // Random color
        color: Math.random() * 0xffffff,
        alpha: 0.5,
      })];

      // Random horizontal position around the winner
      petal.x = (winner?.animation.container.x || 0) - 75 + Math.random() * 150;
      petal.y = 0;
      petal.width = 10;
      petal.height = 10;

      // Random animation speed
      petal.animationSpeed = 0.1 + Math.random() * 0.5;

      petal.zIndex = 0;
      petal.play();
      app.stage.addChild(petal);

      // Animate petal
      tween(petal, {
        duration: (2 + Math.random() * 4) / speed.current,
        ease: 'none',
        y: app.screen.height - 10 - Math.random() * 100,
      }).then(() => {
        // Stop animation
        petal.stop();

        completedPetals += 1;
        if (completedPetals >= 50) {
          updatePerformanceSummary();
        }
      }).catch(console.error);
    }

    // Freeze app after 10 seconds to save GPU.
    setTimeout(() => {
      if (app?.ticker) {
        app.ticker.stop();
      }
    }, 10000);
  };
