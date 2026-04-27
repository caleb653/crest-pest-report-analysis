## Phase 1 — Foundation (now)
1. **Add 4th card** to the Index page: "Client Portal" 
2. **Create database tables**: `portal_clients`, `portal_links`, `portal_properties`, `portal_services`, `portal_prep_sheets`, `portal_messages`
3. **Build the main portal page** (`/client-portal/:token`) — single-page layout with sections for Past Services, Future Services, Prep Sheets, and Message Crest
4. **Build link-based access model**: Master links see all properties; sub-links see only assigned ones
5. **Build admin portal management page** (`/client-portal-admin`) — accessible from the 4th card, where Crest staff can create clients, generate links, add properties/services, and manage prep sheets

## Phase 2 — Detail views
- Past Service detail view with unit-level accordion
- Future Service detail view
- Prep sheet preview/download

## Phase 3 — Messaging & polish
- Message Crest form → sends email to office@crestpestcontrol.com
- Admin impersonation (view as client)
- Polish and mobile optimization

**Shall I proceed with Phase 1?**

## Phase 4 — Compliance documents
- **Pesticide Pre-Application Notice**: auto-generated, per-property digital version
  of the California-required notice. Customized with property name, address, service
  frequency, and target pests pulled from `portal_properties.customer_preferences`.
  - Public route: `/pre-application/:propertyId`
  - Surfaced in Admin (PropertyDashboard) and PM Portal as a "Pesticide Pre-Application
    Notice" card with View / Download (PDF) and Copy Link actions.