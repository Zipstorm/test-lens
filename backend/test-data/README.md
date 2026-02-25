# Test Data

Sample data for developing and testing the Test Lens backend.

## Files

- **sample-tests.csv** — 30 e-commerce regression test cases with columns: ID, Description, Module, Priority. Upload this via the `/api/upload` endpoint.
- **sample-user-stories.json** — 5 sample user stories with expected relevant modules. Use the `text` field as input to the `/api/search` endpoint.

## Usage

1. Start the backend server
2. Upload `sample-tests.csv` via `POST /api/upload`
3. Use stories from `sample-user-stories.json` to query `POST /api/search`
