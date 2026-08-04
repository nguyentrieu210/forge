# R5 / R6 / Alumdoor Pilot

Status: **next program after RC4 engineering/evidence closure**.  
Planning seed: `main@211ba858ca232c3da062553285a97c32e8fe4346`.

## Canonical documents

1. `R5_R6_ALUMDOOR_PILOT_PROGRAM_20260804.md`
   - R5 integrated convergence;
   - package/capability-profile architecture;
   - R6 production certification;
   - Alumdoor controlled pilot and Pilot Exit criteria.

2. `AGENT_BOARD.md`
   - R5-A0..A9;
   - R6-A0..A8;
   - pilot P0..P6;
   - ownership, branch naming, dependencies and stop gates.

## Sequence

`RC4 DONE -> R5-GO -> R6 PILOT-GO -> Alumdoor Pilot -> ACCEPTED PRODUCTION REFERENCE -> GA`

## Key boundary

R5/R6 do not reopen a blanket feature-completion wave. Missing/Foundation/Wired capabilities remain ordinary backlog unless required by pilot scope or a shared safety dependency.

For Alumdoor and future verticals:

- domain packages remain canonical authorities;
- verticals compose capabilities rather than copy code;
- capability disable does not uninstall package/data;
- App Factory profile UI edits versioned server-validated metadata.

These planning documents authorize no non-UI merge, production provider mutation, production migration, restore/PITR or cutover.
