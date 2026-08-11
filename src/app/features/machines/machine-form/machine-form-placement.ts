import type { MachineProfile } from '../../../core/machines/machine-profile';
import { nodeSymbolsOverlap } from '../../../core/schematic/schematic.layout';
import type { GridPosition, SchematicNodeType } from '../../../core/schematic/schematic.models';
import type { NodeFormValue } from './machine-form-model';

export function firstFreeCell(
  nodes: readonly NodeFormValue[],
  gridSize: MachineProfile['gridSize'],
  type: SchematicNodeType,
): GridPosition | undefined {
  for (let row = 0; row < gridSize.rows; row += 1) {
    for (let column = 0; column < gridSize.cols; column += 1) {
      const candidate = { type, grid: [column, row] as GridPosition };
      const overlaps = nodes.some((node) => {
        const { column: nodeColumn, row: nodeRow } = node;
        return (
          nodeColumn !== null &&
          nodeRow !== null &&
          nodeSymbolsOverlap(candidate, {
            type: node.type,
            grid: [nodeColumn, nodeRow],
          })
        );
      });
      if (!overlaps) {
        return candidate.grid;
      }
    }
  }
  return undefined;
}
