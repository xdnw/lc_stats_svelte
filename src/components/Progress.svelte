<div class="progress flex-grow-1" role="status" aria-label="Loading">
    <div class="progress-bar text-bg-info progress-bar-animated placeholder-wave" style="width: 100%;"></div>
</div>
<style>
    @keyframes progress {
        0% { width: 0; }
        15% { width: 75%; }
        100% { width: 100%; }
    }
    .progress-bar {
        animation: progress 15s cubic-bezier(0, 0, 0.2, 1);
    }
</style>