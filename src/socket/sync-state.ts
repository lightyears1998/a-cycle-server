import { HistoryCursor } from "../entity/entry-history";

export class SyncState {
  processingMessageCount = 0;

  hasSyncBegun = false;
  isClosing = false;

  sent = {
    "sync-full-meta-query-count": 0,
    "sync-full-entries-query-count": 0,
    "sync-recent-request-count": 0,
    goodbye: false,
  };

  received = {
    "sync-full-meta-response-count": 0,
    "sync-full-entries-response-count": 0,
    "sync-full-entries-response-first-cursor": null as HistoryCursor | null,
    "sync-recent-response-count": 0,
    goodbye: false,
  };

  isSyncRecentOngoing = (): boolean => {
    return (
      this.sent["sync-recent-request-count"] >
      this.received["sync-recent-response-count"]
    );
  };

  isSyncFullExecuted = (): boolean => {
    return this.sent["sync-full-meta-query-count"] > 0;
  };

  isSyncFullOngoing = (): boolean => {
    return (
      this.sent["sync-full-meta-query-count"] > 0 &&
      (this.sent["sync-full-meta-query-count"] >
        this.received["sync-full-meta-response-count"] ||
        this.sent["sync-full-entries-query-count"] >
          this.received["sync-full-entries-response-count"])
    );
  };

  isSyncFullSucceed = (): boolean => {
    return (
      this.sent["sync-full-meta-query-count"] > 0 &&
      this.sent["sync-full-meta-query-count"] <=
        this.received["sync-full-meta-response-count"] &&
      this.sent["sync-full-entries-query-count"] <=
        this.received["sync-full-entries-response-count"]
    );
  };
}
