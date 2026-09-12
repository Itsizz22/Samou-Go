# Frontend-design refinement plan

Scope: existing public website only. Apply the installed `anthropics/skills` frontend-design guidance without rebuilding the page or changing product systems.

## Tokens
- Brand green #007D62: primary actions and selected/expanded controls.
- Deep green #173E33: headings and strong text.
- Paper #F6FAF6: reading surface.
- Mint #E3F3E9: supporting sections.
- Muted green #526D63: secondary text.
- Logo burgundy #942F36: reserved launch-date accent, reflecting the supplied logo.

Type: existing self-hosted Tajawal. 800 for headings, 700 for controls, 400 for prose; tabular figures only for countdown values. Keep Arabic body copy comfortably below 60 characters per line where possible.

Layout options considered:
A. Full-screen countdown billboard above all content — rejected: obscures what the service is.
B. Preserve the service hero/phone pairing and make the existing launch panel an invitation with one unified countdown — selected.

Desktop (RTL):
[real app phone] [clear service headline + launch CTA]
[categories / benefits / real screenshots / ordering steps]
[one unified launch invitation: date + countdown + follow action]
[local support + legal footer]

Phone: service explanation and CTA first; screenshot next; compact sections; legible single-row countdown; reserved space for the existing bottom action.

## Review against the brief before implementation

Preserve the fixed September 26 launch deadline, official logo, genuine screenshots with demo disclosure, local category wording, legal pages and support hours. Do not add fake merchants or metrics. The identity already uses Tajawal and green; replacing them for novelty would weaken continuity. Avoid a second decorative visual concept: remove benefit numbering because it is not a sequence, keep numbers on the actual ordering steps. Remove repetitive section eyebrows and automatic reveal animations; keep one restrained hero entrance and feedback for deliberate user interaction. Keep requested category cards but reduce excess shadow/borders. Use the logo's burgundy only on the launch date, not as a new competing action color.

## Implementation review
Implemented in design-finish.css with homepage-scoped selectors, retaining the existing components and fixed launch instant. Real screenshot/brand palette remain unchanged. The launch date uses the existing logo burgundy; the countdown is one structured row rather than four nested cards. Benefit numbers and redundant eyebrows were removed. Only the initial hero text retains a short entrance; repeated section animations are disabled. Reviewed phone/desktop captures and retained readable contrast. Responsive/ticking/expiry checks passed at 320, 390, 768 and 1440 pixels; automated WCAG A/AA scans at 390/1440 found no violations.
