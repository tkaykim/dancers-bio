# Client upload report

The report editor now supports a delivery layout alongside the existing analysis layout.
The delivery layout publishes approved submissions from the selected measurement snapshot and an explicit upcoming list.
It does not publish the remaining operations roster, fees, internal notes, applications, or casting forecasts.

- The existing share URL and frozen publication payload are reused.
- Distinct approved post IDs determine video count and view totals.
- Distinct active participant IDs determine the participant/team count.
- Shared links count once; missing observations remain unknown, including when no views were measured.
- Snapshot target IDs prevent later approvals from entering an older reporting period.
- Upcoming names and accounts are explicitly configured, deduplicated, and removed from the upcoming list when an included delivery already matches.
- Manually verified follower observations contain only account, count and observation time.
  Only visible accounts' observations enter the frozen payload.
- The report uses the existing black double-wordmark asset, monochrome styles and Korean section labels.
- Search filters the on-screen table; print includes the full report even while a search is active.
- The existing analysis report and casting-board visibility controls retain their current behavior.

No schema migration, paid collection, recurring monitoring, or outbound message is part of this change.
All campaign-specific evidence and publications live in private operational data, not in this public repository.

Validation covers approval selection, duplicate links, missing/zero observations, snapshot scope, public-field filtering, follower notation, and existing campaign workflows.
Browser checks cover desktop/mobile layout, search, print visibility and logo loading.
