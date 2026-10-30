# Typography and community spacing — 2026-10-30

The owner flagged heavy text, unnecessary heading decorations, and remaining Community card gaps after the Inter rollout.

Changes:
- Replaced 573 extra-bold/black UI declarations with semibold 600 across platform screens, shared components, and public page styles. Certificate theme typography is retained.
- Reduced 323 button, badge, and small-label bold declarations to medium 500. Shared navigation, tags, and controls use medium; heading styles use semibold. Regular reading text keeps its existing weight.
- Removed 68 standalone decorative icons immediately preceding static section titles. Navigation and ordinary action icons remain. Removed the cohort timeline/enrollment emoji prefixes and greeting emoji in the public illustrative preview. Learner-authored posts and share-message content are unchanged.
- Replaced Community's independent flex columns with one responsive grid. Recent discussions span the available width; remaining sections share rows. Card margins no longer compound with collection gaps. Desktop/mobile gap follows the existing 16px/12px spacing tokens. Redundant borders, padding, and shadows on nested cohort cards are removed.

Checks:
- 47 automated tests passed before the final weight-only adjustment.
- 73 screen components rendered without errors.
- Community populated, empty, error, preview-limit, and full-list navigation render checks passed after the final weight adjustment.
- Production build passed.

Browser review: Opera access was attempted, but local browser use is disabled in Work settings. No fresh visual screenshot is claimed. Release is confirmed through production-served assets.
