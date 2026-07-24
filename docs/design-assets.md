# Credimi design assets

The Fastify runtime copies are `src/api/assets/style.css` (SHA-256 `ff452337f866cae1060057a8c417752b5a9767f59b748c9c7cde509c638387c7`), `src/api/assets/credimi_logo.svg` (SHA-256 `031885760a9165e9d8d49eab45baca30ba5ed8dd1fbf0b4699fba2de5dc4feac`), and `src/api/assets/credimi_logo_negative.svg` (SHA-256 `32df33f9f5ffa696d452e1f65f5d6738b920415c5114db4b010af1f997a8cb3a`). They are unchanged copies of the corresponding `HITL/` inputs.

The regular logo is served as `/favicon.svg` and appears on light surfaces. The negative logo appears only on the dark footer. `audit-ui.css` loads after the shared foundation. Replace the HITL input intentionally and synchronize the runtime asset to update shared branding.
