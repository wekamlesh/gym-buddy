# Data-entry form audit

The app is for Tenzo only. Personal details and the original DEXA baseline are already configured. This audit covers the fields shown by each modal and the values that can be saved to each data model.

| Entry | Main fields | Optional fields | Fields deliberately excluded |
| --- | --- | --- | --- |
| Water | Date, quantity in ml, time in IST | Unknown time may remain blank on older entries | Food, calories, workouts, measurements and notes |
| Food eaten | Date, meal category, time, food name, calories, protein | Portion, notes, save as reusable meal | Workout and measurement fields |
| Saved meal template | Food name, calories, protein | Portion, notes | Eating date, eating time and meal category; chosen when reusing it |
| Treadmill walk / walk–run | Date, start time, duration, activity | Distance; collapsed speed/incline, effort/feeling/notes and watch readings | Food, water and body measurements |
| Outdoor walk | Date, start time, duration, activity | Distance; collapsed effort/feeling/notes and watch readings | Treadmill speed and incline |
| Badminton / strength / other activity | Date, start time, duration, activity | Collapsed effort/feeling/notes and watch readings; strength notes can record sets/reps | Distance, treadmill speed and incline |
| Body measurements | Date, measurement type, at least one body measurement | Weight, waist, chest, hips and arm; optional measured time and notes | DEXA-only values |
| DEXA scan | Date, measurement type, at least one scan measurement | Weight, body fat, lean soft tissue, visceral fat, optional measured time and notes | Waist, chest, hips and arm |
| Daily check-in | Food-log completion; daily date is shown in the heading | Steps, sleep, notes; recovery checkbox only for a recovery day or an existing recovery entry | Water quantities, meal nutrition, workout settings and per-event time |
| Plan settings | Daily targets and workout schedule | Optional calorie and goal-weight targets | Name, email, age, sex, height and original DEXA measurements |
| DEXA baseline viewer | Read-only report values | None | All editable fields |

## Behavior and compatibility

- New water, meal and activity entries include an editable IST time. Quick water buttons use the current IST time for today; on a historical date they open the quantity/time form instead of inventing a past time.
- An older entry without an event time remains unknown unless Tenzo enters a time. The last-edit timestamp is not used as a substitute.
- Changing workout or measurement type preserves common draft values and replaces the type-specific fields. Only fields relevant to the final selected type are saved.
- Effort and feeling are optional and stay unrecorded until entered; the app no longer silently records a default effort or mood.
- Ordinary measurements default to body measurements. Selecting DEXA shows scan fields. Older combined records still show both sets of existing values so editing does not silently discard them.
- Reusable meals can be edited directly. Their nutrition is reused, but the new food log gets its own date, meal category and time.
- Optional notes and watch fields are grouped in expandable sections. Meal and measurement notes have the same 500-character limit in the form and API; workout/check-in notes allow 1,000 characters.
- Model validation runs in the browser and server. Unrelated populated fields are rejected, while legacy blank workout/measurement fields remain readable.
- Existing JSON payload storage supports the added time and measurement-kind properties; no D1 schema migration is required.

## Verification

`tests/entry-models.test.js` checks payload boundaries, optional values, time validation, legacy compatibility and model-specific fields. `tests/forms-browser.mjs` checks the visible fields and saves for all six activity types, water, meals, meal templates, body/DEXA measurements and daily check-ins. It refuses to mutate the personal local account and requires the synthetic test server.

```bash
GYM_BUDDY_TEST_MODE=1 npm run dev
# In another terminal:
npm run test:forms
```
