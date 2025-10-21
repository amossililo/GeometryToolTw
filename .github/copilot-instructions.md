# Copilot Instructions for GeometryToolTw

## Project Overview
GeometryToolTw is a web-based orthogonal plan sketcher that allows users to create floor plans using horizontal and vertical lines. The application provides interactive drawing capabilities with grid snapping, real-time measurements, and export functionality.

## Key Components and Patterns

### Canvas System (`index.html`)
- Uses Fabric.js for canvas manipulation
- Grid system with configurable cell size (`GRID` variable)
- Snap-to-grid functionality implemented via `snap()` function
- All lines must be orthogonal (horizontal/vertical only)

### UI Architecture
- Two-panel layout: sidebar controls + main canvas
- Drag-and-drop interface for adding line segments
- All measurements update in real-time via `updateMetrics()`

### State Management
- Canvas state tracked through Fabric.js objects
- Global `polygon` variable for closed shape state
- Scale/unit conversions: grid pixels ↔ real-world units

### Core Functions
- `drawGrid()`: Creates the background grid
- `dedupeAndOrder()`: Orders points for polygon creation
- `shoelace()`: Calculates polygon area
- `collectPayload()`: Formats data for export/sheets integration

### Integration Points
- Google Sheets export via Apps Script Web App
- JSON export functionality
- Note: Apps Script URL needs configuration in `sendSheets()`

## Development Patterns

### Metrics Updates
Always call `updateMetrics()` after:
- Adding/removing lines
- Changing grid settings
- Modifying scale settings

### Grid Operations
Grid changes require:
```javascript
GRID = newValue;
resetGrid();
updateScaleText();
```

### Adding UI Controls
Follow established pattern:
1. Add control to sidebar cards
2. Attach event listeners for real-time updates
3. Update relevant metrics/display

## External Dependencies
- Fabric.js v5.3.0 (via CDN)
- Google Apps Script (for sheets export)