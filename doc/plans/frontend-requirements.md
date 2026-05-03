# Frontend Development Requirements

## Project Overview

**Project**: Paperclip Management UI
**Tech Stack**: React + Vite, Tailwind CSS, Radix UI, React Router
**Location**: `ui/src/`

---

## 1. Existing UI Structure Analysis

### 1.1 Directory Structure

```
ui/src/
├── api/                    # API client modules (auth, agents, issues, projects, etc.)
├── components/
│   ├── ui/                 # Base UI components (Radix UI based)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── tabs.tsx
│   │   ├── sheet.tsx
│   │   └── ... (20+ base components)
│   ├── Layout.tsx          # Main layout with sidebar, breadcrumbs, mobile nav
│   ├── Sidebar.tsx         # Desktop sidebar navigation
│   ├── MobileBottomNav.tsx # Mobile bottom navigation bar
│   ├── CompanyRail.tsx     # Company switcher rail
│   ├── CommandPalette.tsx  # Search/command palette (Cmd+K)
│   ├── BreadcrumbBar.tsx   # Breadcrumb navigation
│   ├── MetricCard.tsx      # Dashboard metric cards
│   ├── ActivityCharts.tsx  # Dashboard charts
│   ├── ActivityRow.tsx     # Activity feed items
│   ├── IssuesList.tsx      # Issue list with filters, grouping, Kanban
│   ├── IssueColumns.tsx    # Issue column definitions for inbox
│   ├── IssueRow.tsx        # Single issue row component
│   ├── KanbanBoard.tsx     # Drag-and-drop Kanban board
│   ├── IssueProperties.tsx # Issue properties panel
│   ├── IssueChatThread.tsx # Chat interface for issues
│   ├── GoalTree.tsx        # Goal hierarchy tree view
│   ├── OrgChart.tsx        # Organization chart with pan/zoom
│   ├── PageSkeleton.tsx    # Loading skeletons for various pages
│   ├── EmptyState.tsx       # Empty state placeholder
│   ├── NewIssueDialog.tsx  # Create issue modal
│   ├── NewProjectDialog.tsx # Create project modal
│   ├── NewGoalDialog.tsx   # Create goal modal
│   ├── NewAgentDialog.tsx  # Create agent modal
│   └── OnboardingWizard.tsx # Multi-step onboarding
├── pages/                  # Route page components (45+ pages)
│   ├── Dashboard.tsx
│   ├── Issues.tsx / IssueDetail.tsx
│   ├── Agents.tsx / AgentDetail.tsx
│   ├── Projects.tsx / ProjectDetail.tsx
│   ├── Routines.tsx / RoutineDetail.tsx
│   ├── Goals.tsx / GoalDetail.tsx
│   ├── Approvals.tsx / ApprovalDetail.tsx
│   ├── Costs.tsx
│   ├── Activity.tsx
│   ├── Inbox.tsx
│   ├── OrgChart.tsx
│   ├── CompanySettings.tsx / CompanySkills.tsx
│   ├── InstanceSettings.tsx / InstanceGeneralSettings.tsx
│   ├── AdapterManager.tsx
│   ├── PluginManager.tsx
│   └── ... (auth, invite, not found pages)
├── context/               # React context providers
│   ├── SidebarContext.tsx  # Sidebar open/close + mobile detection
│   ├── CompanyContext.tsx  # Company selection state
│   ├── DialogContext.tsx    # Modal dialog management
│   ├── PanelContext.tsx     # Properties panel state
│   ├── ThemeContext.tsx     # Dark/light theme
│   ├── LocaleContext.tsx    # i18n locale
│   └── BreadcrumbContext.tsx
├── hooks/                  # Custom React hooks
├── lib/                    # Utility functions and helpers
└── adapters/              # Adapter configurations (Claude, Codex, etc.)
```

### 1.2 Base UI Components (Radix UI)

| Component | Purpose |
|-----------|---------|
| Button | Action buttons with variants |
| Dialog | Modal dialogs |
| DropdownMenu | Context menus |
| Input | Text inputs |
| Select | Dropdown selects |
| Tabs | Tab navigation |
| Sheet | Side panels |
| Popover | Popover containers |
| Tooltip | Tooltips |
| Checkbox | Checkboxes |
| Separator | Dividers |
| Skeleton | Loading placeholders |
| ScrollArea | Custom scroll area |
| Avatar | User/agent avatars |
| Badge | Status badges |
| Label | Form labels |
| Textarea | Multi-line text |
| ToggleSwitch | Toggle switches |
| Command | Command palette |
| Card | Card containers |

### 1.3 Key Pages (Routes)

| Route | Page | Features |
|-------|------|----------|
| `/dashboard` | Dashboard | Metrics, charts, activity feed, recent issues |
| `/issues` | Issues | List/Kanban view, filters, search, grouping |
| `/issues/:id` | IssueDetail | Chat, comments, properties, activity timeline |
| `/agents` | Agents | Agent list with status |
| `/agents/:id` | AgentDetail | Agent config, runs, skills |
| `/projects` | Projects | Project list |
| `/projects/:id` | ProjectDetail | Project issues, workspaces |
| `/routines` | Routines | Routine list |
| `/goals` | Goals | Goal tree view |
| `/approvals` | Approvals | Pending approvals |
| `/costs` | Costs | Cost breakdown charts |
| `/activity` | Activity | Activity log |
| `/inbox` | Inbox | Notification inbox |
| `/org` | OrgChart | Pan/zoom org tree |
| `/company/settings` | CompanySettings | Company config |
| `/instance/settings` | InstanceSettings | Instance config |

### 1.4 Responsive Design Architecture

**Mobile Breakpoint**: `768px` (defined in `SidebarContext.tsx`)

**Responsive Patterns Observed**:
- `isMobile` state tracked via `window.matchMedia`
- Sidebar collapses to off-canvas drawer on mobile
- Mobile bottom navigation bar (`MobileBottomNav.tsx`) with 5 items
- Grid layouts switch from `grid-cols-2` to `grid-cols-4` at `lg:` breakpoint
- Dashboard metrics: `grid-cols-2 xl:grid-cols-4`
- Charts: `grid-cols-2 lg:grid-cols-4`
- Safe area insets for notched devices (`env(safe-area-inset-bottom)`)

---

## 2. Existing Component Inventory

### Layout Components

| Component | Description | Mobile Support |
|-----------|-------------|----------------|
| Layout | Main app shell | Full responsive |
| Sidebar | Desktop navigation | Hidden on mobile |
| MobileBottomNav | Mobile navigation | Mobile only |
| CompanyRail | Company switcher | Responsive |
| BreadcrumbBar | Breadcrumb trail | Responsive |
| PropertiesPanel | Right-side properties | Sheet on mobile |
| CommandPalette | Search/commands | Responsive |

### Dashboard Components

| Component | Description |
|-----------|-------------|
| MetricCard | KPI display card |
| ActivityCharts | Run, priority, status, success charts |
| ActivityRow | Single activity item |
| ActiveAgentsPanel | Currently running agents |
| PageSkeleton | Loading placeholder |

### Issue Components

| Component | Description |
|-----------|-------------|
| IssuesList | Full list/board with filters |
| IssueRow | Single issue row |
| IssueColumns | Column definitions for inbox |
| KanbanBoard | Drag-drop board |
| IssueProperties | Properties panel |
| IssueChatThread | Chat interface |
| IssueFiltersPopover | Filter UI |
| IssueWorkspaceCard | Workspace link card |
| NewIssueDialog | Create issue modal |

### Agent Components

| Component | Description |
|-----------|-------------|
| AgentConfigForm | Agent configuration form |
| AgentIconPicker | Icon selection |
| AgentProperties | Agent properties |
| AgentActionButtons | Start/stop/pause buttons |
| ActiveAgentsPanel | Active agents list |
| NewAgentDialog | Create agent modal |

### Project Components

| Component | Description |
|-----------|-------------|
| ProjectProperties | Project properties |
| NewProjectDialog | Create project modal |
| ProjectWorkspaceDetail | Workspace view |

### Shared Components

| Component | Description |
|-----------|-------------|
| EmptyState | Empty placeholder |
| Identity | User/agent identity display |
| StatusIcon | Status indicator |
| PriorityIcon | Priority indicator |
| InlineEditor | Inline text editing |
| MarkdownEditor | Markdown editor |
| MarkdownBody | Markdown renderer |
| CopyText | Copy-to-clipboard |
| FilterBar | Filter controls |
| PageTabBar | Tab navigation |
| ScheduleEditor | Cron/expression editor |
| EnvVarEditor | Environment variables |
| JsonSchemaForm | JSON schema form |
| CommentThread | Comment thread |
| ApprovalCard | Approval request card |
| GoalTree | Goal hierarchy |
| BudgetPolicyCard | Budget policy display |
| BudgetIncidentCard | Budget incident alert |

---

## 3. Missing Components & Features

### 3.1 Missing Components

| Component | Priority | Description |
|-----------|----------|-------------|
| DataTable | High | Reusable data table with sorting, pagination |
| DateRangePicker | High | Date range selection for filters |
| FileUpload | Medium | File upload component |
| AdvancedSearch | Medium | Complex search builder |
| NotificationToast | Medium | Toast notification system improvements |
| ProgressBar | Low | Progress indicator |
| Stepper | Low | Multi-step wizard component |
| TreeSelect | Low | Tree-based select dropdown |

### 3.2 Missing Pages/Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Notification Center | High | Dedicated notifications page |
| User Profile Page | Medium | User settings and profile |
| Audit Log Page | Medium | Compliance audit trail |
| Webhook Settings | Medium | Webhook configuration UI |
| API Keys Management | Medium | API key CRUD |
| Export/Import Utilities | Low | Data export tools |

### 3.3 Mobile Experience Gaps

| Issue | Priority | Description |
|-------|----------|-------------|
| Issue Detail Mobile | High | Better mobile layout for issue detail |
| Agent Detail Mobile | High | Mobile-friendly agent configuration |
| Project Mobile | Medium | Project management on mobile |
| OrgChart Mobile | Medium | Touch-friendly org chart navigation |
| Settings Mobile | Medium | Settings pages need mobile optimization |
| Properties Panel Mobile | High | Should be a bottom sheet on mobile |

---

## 4. Responsive Issues

### 4.1 Confirmed Responsive Problems

| Issue | Location | Description |
|-------|----------|-------------|
| Sidebar overlay | Layout.tsx:330-337 | Overlay button not easily dismissible |
| PropertiesPanel | Layout.tsx:484 | Always visible on desktop, should be sheet on mobile |
| OrgChart touch | OrgChart.tsx | Pan/zoom works but no touch-friendly controls |
| Issue detail header | IssueDetail.tsx | Complex header layout not mobile-optimized |
| ActivityCharts | ActivityCharts.tsx | Charts may overflow on small screens |
| MetricCard description | MetricCard.tsx:28 | `hidden sm:block` hides important info |
| KanbanBoard | KanbanBoard.tsx:69 | Column widths are fixed, may cause horizontal scroll issues |
| Page skeletons | PageSkeleton.tsx | Some skeletons have fixed heights that may not fit |

### 4.2 Responsive Patterns to Improve

| Pattern | Current | Expected |
|---------|---------|----------|
| Sidebar | Off-canvas on mobile | Should support swipe gestures (partially done) |
| Tables | May overflow | Should be horizontally scrollable or card-based on mobile |
| Forms | Stacked labels | Should maintain usability on narrow screens |
| Modals | May be too tall | Should respect safe areas and scroll internally |

---

## 5. Prioritized Requirements

### P0 - Critical (Current Sprint)

1. **DataTable Component**
   - Reusable table with sortable columns, pagination, row selection
   - Used by: Issues, Agents, Projects, Activity lists

2. **Mobile Properties Panel**
   - Convert to bottom sheet on mobile
   - Slide-up panel instead of side panel

3. **DateRangePicker Component**
   - For costs and activity date filtering
   - Preset ranges + custom range

### P1 - High Priority

4. **Mobile Issue Detail Optimization**
   - Simplified header for mobile
   - Tab-based navigation for sections
   - Sticky action bar

5. **Advanced Search Component**
   - Filter builder for issues
   - Save search queries

6. **Notification Center Page**
   - Dedicated notifications page
   - Grouping and filtering
   - Mark read/unread bulk actions

### P2 - Medium Priority

7. **Agent Detail Mobile View**
   - Simplified config form for mobile
   - Collapsible sections

8. **OrgChart Touch Improvements**
   - Pinch-to-zoom support
   - Larger touch targets for zoom controls

9. **Export/Import UI**
   - CSV/JSON export for issues
   - Import wizard

10. **Webhook Settings UI**
    - Webhook list and creation
    - Test webhook feature

### P3 - Low Priority

11. **User Profile Page**
    - Avatar upload
    - Notification preferences

12. **Audit Log Page**
    - Searchable audit trail
    - Filter by action type

13. **API Keys Management**
    - Create/revoke API keys
    - Usage statistics

14. **FileUpload Component**
    - Drag-and-drop uploads
    - Progress indication

---

## 6. Technical Debt & Improvements

### 6.1 Code Organization

| Issue | Recommendation |
|-------|----------------|
| Large page components | Break down into smaller sub-components |
| Duplicate filter logic | Extract shared filter utilities |
| Inline styles | Minimize inline styles, use Tailwind classes |
| Long prop drilling | Use context or composition |

### 6.2 Performance

| Issue | Recommendation |
|-------|----------------|
| Large bundle size | Consider lazy loading for route pages |
| Re-renders | Use React.memo for list items |
| API calls | Add request deduplication |
| Chart rendering | Virtualize for large datasets |

### 6.3 Testing

| Gap | Recommendation |
|-----|----------------|
| No component tests | Add unit tests for key components |
| No e2e tests | Add Playwright/Cypress tests |
| No visual regression | Add screenshot tests |

### 6.4 Accessibility

| Issue | Recommendation |
|-------|----------------|
| Focus management | Audit focus traps in modals |
| ARIA labels | Add missing labels |
| Keyboard navigation | Test all interactive flows |
| Color contrast | Verify WCAG AA compliance |

---

## 7. Dependencies & Versions

```json
{
  "react": "^18.x",
  "react-dom": "^18.x",
  "react-router-dom": "^6.x",
  "@tanstack/react-query": "^5.x",
  "tailwindcss": "^3.x",
  "@radix-ui/react-*": "latest",
  "@dnd-kit/core": "^6.x",
  "lucide-react": "latest",
  "recharts": "^2.x",
  "date-fns": "^3.x"
}
```

---

## 8. File Locations Reference

| Area | Path |
|------|------|
| Base UI Components | `ui/src/components/ui/` |
| Page Components | `ui/src/pages/` |
| Shared Components | `ui/src/components/` |
| Context Providers | `ui/src/context/` |
| API Clients | `ui/src/api/` |
| Utilities | `ui/src/lib/` |
| Custom Hooks | `ui/src/hooks/` |
| Routing Config | `ui/src/App.tsx` |
| Tailwind Config | `ui/tailwind.config.js` |
| Vite Config | `ui/vite.config.ts` |
