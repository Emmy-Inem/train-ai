# Card spacing repair — 2026-10-30

The learner home page now uses one shared grid instead of independent columns. Cohort and shortcuts share the first row; progress spans the recommendation and bookmark rows, closing the large empty column shown in the owner's screenshot. The AI recommendation heading is inside its card, removing compounded section and card margins. Learners without a cohort get a compact full-width notice instead of a stretched empty panel.

Dashboard panels use consistent 16px desktop / 12px mobile gaps and 20px / 16px home-card padding. The admin dashboard places the wide KPI table on its own row and puts monitoring panels in shared rows. Existing shared collection spacing remains scoped to card collections, without changing chat, editor, or table spacing.

36 auto-sized grids across learner, instructor, admin, owner, and public marketplace views now use shrinkable minimum widths. They retain their preferred card widths on desktop and fit available space on narrow screens.

Validation:
- Production build passed; 47 automated tests passed.
- 73 screen components rendered without errors in an isolated fixture.
- Opera local fixture confirmed a 16px desktop gap, matching column widths, aligned card edges, and no horizontal overflow on learner home. Mobile was visually checked at 390px using the local iframe preview.
- Local screenshots are ignored under .generated/spacing-learner-desktop.png and .generated/spacing-learner-mobile.png.
- Browser access was disabled in Work settings during the review. Final live deployment is checked through the served production HTML/CSS, rather than claiming a subsequent browser visual review.
