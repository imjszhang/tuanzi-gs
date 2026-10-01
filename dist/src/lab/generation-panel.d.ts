/** Presentation only: no provider, adaptive engine or reference solver dependencies. */
import type { LabEvent } from './types.js';
import type { GenerationRecord } from './generation.js';
export declare const generationCard = "<section id=\"generation-card\" class=\"generation-card hidden\" aria-label=\"G \u7684\u53EF\u89C1\u8F93\u51FA\">\n <div class=\"generation-heading\"><span class=\"generation-mark\">G</span><div><h3>\u751F\u6210\u8FC7\u7A0B</h3><p id=\"generation-meta\"></p></div><span id=\"generation-live\" class=\"stream-indicator\">\u25CF</span><button id=\"generation-expand\" class=\"text-button\" aria-haspopup=\"dialog\">\u5C55\u5F00 \u2197</button></div>\n <p id=\"generation-status\" class=\"generation-status\" role=\"status\"></p>\n <div class=\"generation-switch\" role=\"tablist\" aria-label=\"\u8F93\u51FA\u7C7B\u578B\"><button id=\"generation-reasoning-tab\" role=\"tab\" aria-selected=\"true\" aria-controls=\"generation-preview\" tabindex=\"0\">\u63A8\u7406</button><button id=\"generation-content-tab\" role=\"tab\" aria-selected=\"false\" aria-controls=\"generation-preview\" tabindex=\"-1\">\u5185\u5BB9</button><span id=\"generation-count\"></span></div>\n <pre id=\"generation-preview\" class=\"stream-text compact\" tabindex=\"0\" role=\"tabpanel\" aria-label=\"\u5F53\u524D\u901A\u9053\u7684\u53EF\u89C1\u8F93\u51FA\"></pre>\n <div class=\"generation-foot\"><small id=\"generation-mode\"></small><button id=\"generation-follow\" class=\"text-button\">\u8DDF\u968F\u6700\u65B0 \u2193</button></div>\n <p class=\"generation-disclaimer\">\u4EC5\u663E\u793A\u63A5\u53E3\u5B9E\u9645\u8FD4\u56DE\u7684\u6587\u672C\u3002\u6D41\u5F0F\u8349\u7A3F\u672A\u751F\u6548\uFF0C\u5B8C\u6574\u63D0\u6848\u4ECD\u9700\u6821\u9A8C\u4E0E S \u9009\u62E9\u3002</p>\n</section>";
export declare const generationDialog = "<dialog id=\"generation-dialog\" class=\"generation-dialog\" aria-labelledby=\"generation-title\">\n <div class=\"dialog-head\"><div><p class=\"overline\">G / \u751F\u6210\u8F93\u51FA \u00B7 \u53EA\u8BFB</p><h2 id=\"generation-title\">\u67E5\u770B\u751F\u6210\u8FC7\u7A0B</h2></div><button class=\"icon-button\" data-close=\"generation-dialog\" aria-label=\"\u5173\u95ED\u751F\u6210\u8FC7\u7A0B\">\u00D7</button></div>\n <div class=\"dialog-body\"><label for=\"generation-select\">\u672C\u573A\u5B9E\u9A8C\u7684 G \u8C03\u7528</label><select id=\"generation-select\"></select>\n <div class=\"stream-detail-meta\"><span id=\"generation-detail-status\" role=\"status\"></span><span id=\"generation-detail-metrics\"></span></div>\n <p id=\"generation-detail-source\" class=\"field-help\"></p>\n <div class=\"stream-columns\"><section><h3>\u63A8\u7406 <span>\u670D\u52A1\u5546\u663E\u5F0F\u8FD4\u56DE</span></h3><pre id=\"generation-reasoning\" class=\"stream-text\" tabindex=\"0\" aria-label=\"\u670D\u52A1\u5546\u8FD4\u56DE\u7684\u63A8\u7406\"></pre></section><section><h3>\u5185\u5BB9 <span>\u751F\u6210\u7684\u63D0\u6848\u6587\u672C</span></h3><pre id=\"generation-content\" class=\"stream-text\" tabindex=\"0\" aria-label=\"\u751F\u6210\u7684\u5185\u5BB9\"></pre></section></div>\n <p id=\"generation-detail-error\" class=\"callout warning hidden\"></p>\n <p class=\"field-help\">\u6587\u672C\u4E0D\u662F\u5DF2\u9A8C\u8BC1\u4E8B\u5B9E\uFF0C\u4E5F\u4E0D\u662F\u5DF2\u6267\u884C\u52A8\u4F5C\u3002\u672A\u516C\u5F00\u7684\u5185\u90E8\u63A8\u7406\u65E0\u6CD5\u5C55\u793A\u3002\u5931\u8D25\u6216\u4E2D\u65AD\u540E\u4FDD\u7559\u5DF2\u6536\u5230\u7684\u7247\u6BB5\uFF0C\u4F46\u4E0D\u6267\u884C\u534A\u6210\u54C1\u3002</p></div>\n <div class=\"dialog-footer\"><span id=\"generation-reading-state\">\u53EA\u8BFB\u89C2\u5BDF\u4E0D\u4F1A\u91CD\u8BD5\u6216\u4EA7\u751F\u6A21\u578B\u8C03\u7528\u3002</span><button id=\"generation-detail-follow\" class=\"quiet\">\u8DDF\u968F\u6700\u65B0 \u2193</button><button id=\"generation-copy\" class=\"quiet\">\u590D\u5236\u53EF\u89C1\u6587\u672C</button><button class=\"primary\" data-close=\"generation-dialog\">\u5173\u95ED</button></div>\n</dialog>";
export declare class GenerationPanel {
    private open;
    private toast;
    private records;
    private run;
    private selected;
    private latest;
    private channel;
    private explicitChannel;
    private reading;
    private replay;
    private connected;
    private cacheKey;
    constructor(open: () => void, toast: (s: string) => void);
    private resetScroll;
    private paintText;
    update(runId: string, events: readonly LabEvent[], through: number, { replay, connected }: {
        replay: boolean;
        connected: boolean;
    }): void;
    private compact;
    private chosen;
    private detail;
    snapshot(): GenerationRecord[];
}
