import { BUCKET_IDS, type BucketId } from '../core/data/series.catalog';
import type { SelectOption } from './controls/select-option';

/**
 * One aggregation menu for both filter bars. The Dashboard used to hand-write its list and the
 * Measurements screen derived its own, so the two screens offered different choices for the same
 * concept.
 */
export const BUCKET_OPTIONS: readonly SelectOption<BucketId>[] = BUCKET_IDS.map((id) => ({
  value: id,
  label: `bucket.${id}`,
}));
