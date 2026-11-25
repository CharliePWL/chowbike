'use client';

import { useMemo } from 'react';
import { buildPowerPreviewBlocks } from '@/lib/fit/intervalParser';
import type { Workout } from '@/types/training';

interface PowerPreviewChartProps {
  workout: Workout;
  ftpWatts: number;
}

/** Zone-coloured fill for a power bar.
 *  Z1-Z2 → steel blue family
 *  Z3-Z4 → warm amber/ochre
 *  Z5+   → burnt orange/red
 */
function barFill(watts: number, ftpWatts: number, intensity: string): string {
  if (intensity === 'recovery' || watts < ftpWatts * 0.56) return '#3A5A72'; // deep steel blue Z1
  const ratio = watts / Math.max(100, ftpWatts);
  if (ratio < 0.76) return '#4E7A96';   // Z2 endurance — mid steel
  if (ratio < 0.90) return '#6A95AE';   // upper Z2 — lighter steel
  if (ratio < 1.00) return '#B8882A';   // Z3 tempo — warm ochre
  if (ratio < 1.06) return '#C47820';   // Z4 threshold — deeper amber
  if (ratio < 1.20) return '#C46A28';   // Z5 VO2max — burnt amber
  return '#B84A32';                      // Z6+ anaerobic — burnt red
}

export function PowerPreviewChart({
  workout,
  ftpWatts,
}: PowerPreviewChartProps) {
  const blocks = useMemo(
    () => buildPowerPreviewBlocks(workout, ftpWatts),
    [workout, ftpWatts]
  );

  if (blocks.length === 0) return null;

  const totalSec = blocks.reduce((sum, b) => sum + b.durationSec, 0);
  if (totalSec <= 0) return null;

  const maxBlockWatts = Math.max(...blocks.map((b) => b.watts), ftpWatts);
  const ceilingWatts = Math.max(ftpWatts * 1.25, maxBlockWatts * 1.08);
  const svgWidth = 280;
  const svgHeight = 52;
  const minBarHeight = 4;
  const ftpY =
    svgHeight -
    Math.max(minBarHeight, (ftpWatts / ceilingWatts) * (svgHeight - 6));

  return (
    <div
      className="mt-3 overflow-hidden rounded-sm"
      aria-label="Workout interval power preview"
      style={{ background: '#161618' }}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="none"
        className="h-[52px] w-full"
        role="img"
      >
        {/* Matte charcoal floor line */}
        <rect x={0} y={svgHeight - 1} width={svgWidth} height={1} fill="#2A2A30" />

        {/* Dashed FTP reference line */}
        <line
          x1={0}
          x2={svgWidth}
          y1={ftpY}
          y2={ftpY}
          stroke="#6B8FA8"
          strokeOpacity={0.55}
          strokeWidth={0.75}
          strokeDasharray="4 3"
        />

        {blocks.map((block, idx) => {
          const x = (block.startSec / totalSec) * svgWidth;
          const rawWidth = (block.durationSec / totalSec) * svgWidth;
          const width = Math.max(1.5, rawWidth - (blocks.length > 1 ? 0.8 : 0));
          const height = Math.max(
            minBarHeight,
            (block.watts / ceilingWatts) * (svgHeight - 6)
          );
          const y = svgHeight - height;
          const fill = barFill(block.watts, ftpWatts, block.intensity);

          const mins = Math.round(block.durationSec / 60);
          const durLabel =
            mins >= 1 ? `${mins}m` : `${block.durationSec}s`;
          const wattLabel =
            block.lowWatts === block.highWatts
              ? `${block.lowWatts}W`
              : `${block.lowWatts}-${block.highWatts}W`;

          return (
            <rect
              key={`${idx}-${block.startSec}`}
              x={x}
              y={y}
              width={width}
              height={height}
              rx={0}
              fill={fill}
              fillOpacity={0.92}
            >
              <title>{`${block.label}: ${durLabel} @ ${wattLabel}`}</title>
            </rect>
          );
        })}
      </svg>

      {/* FTP label overlay */}
      <div className="flex items-center justify-between px-2 py-1">
        <span
          className="font-mono text-[9px] font-medium tracking-wider uppercase"
          style={{ color: '#6B8FA8' }}
        >
          FTP {ftpWatts}W
        </span>
        <span
          className="font-mono text-[9px] font-medium tracking-wider uppercase"
          style={{ color: '#4A4A52' }}
        >
          POWER
        </span>
      </div>
    </div>
  );
}
