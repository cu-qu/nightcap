import { render } from "@testing-library/react-native";
import React from "react";

import {
  buildCometTrack,
  headAt,
  ShootingStarTransition,
  streakCenter,
} from "@/src/components/ShootingStarTransition";

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("shooting star path", () => {
  it("shows the saved caption while the star is crossing", async () => {
    const view = await render(
      React.createElement(ShootingStarTransition, {
        visible: true,
        onFinished: () => undefined,
      })
    );
    expect(view.getByText("NightCap saved")).toBeOnTheScreen();
    expect(view.getByText("Sweet dreams")).toBeOnTheScreen();
    view.unmount();
  });

  const phones = [
    [390, 844],
    [375, 667],
    [430, 932],
  ] as const;

  it("moves at a constant speed", () => {
    const track = buildCometTrack(390, 844);
    const pts = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => headAt(track, t));
    const gaps = pts.slice(1).map((p, i) => dist(p, pts[i]));
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(gaps[0], 5);
    }
  });

  it("keeps every streak tip pinned to the head, trailing straight behind it", () => {
    const track = buildCometTrack(390, 844);
    const t = 0.45;
    const length = 120;
    const head = headAt(track, t);
    const center = streakCenter(track, t, length);
    const tip = {
      x: center.x + track.ux * (length / 2),
      y: center.y + track.uy * (length / 2),
    };
    const tail = {
      x: center.x - track.ux * (length / 2),
      y: center.y - track.uy * (length / 2),
    };

    expect(Math.hypot(track.ux, track.uy)).toBeCloseTo(1, 6);
    expect(track.angle).toBeCloseTo(
      (Math.atan2(track.y1 - track.y0, track.x1 - track.x0) * 180) / Math.PI,
      5
    );
    expect(tip.x).toBeCloseTo(head.x, 5);
    expect(tip.y).toBeCloseTo(head.y, 5);
    expect(dist(tail, head)).toBeCloseTo(length, 4);
  });

  it("crosses the sky above the caption on phone screens", () => {
    for (const [width, height] of phones) {
      const track = buildCometTrack(width, height);
      expect(track.enter).toBeGreaterThan(0);
      expect(track.exit).toBeLessThan(1);
      expect(track.exit).toBeGreaterThan(track.enter);

      const sparks = [...track.sparks];
      expect(sparks).toEqual([...sparks].sort((a, b) => a - b));
      for (const born of sparks) {
        expect(born).toBeGreaterThan(track.enter);
        expect(born).toBeLessThan(track.exit);
      }

      for (let i = 0; i <= 40; i++) {
        const p = headAt(track, i / 40);
        if (p.x >= 0 && p.x <= width) {
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(height * 0.5);
        }
      }
    }
  });
});
