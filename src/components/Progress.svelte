<div class="ux-progress-line" role="status" aria-label="Loading" aria-live="polite">
    <div class="ux-progress-line-track"></div>
    <div class="ux-progress-line-bar"></div>
</div>

<style>
    .ux-progress-line {
        position: relative;
        width: 100%;
        height: 0;
        margin: 0;
        overflow: visible;
        pointer-events: none;
        z-index: 10;
    }

    .ux-progress-line-track,
    .ux-progress-line-bar {
        position: absolute;
        inset: 0 0 auto 0;
        height: 2px;
        border-radius: 999px;
    }

    .ux-progress-line-track {
        background: color-mix(in srgb, var(--ux-border) 48%, transparent);
    }

    .ux-progress-line-bar {
        width: min(11rem, 30%);
        min-width: 5rem;
        background: color-mix(in srgb, var(--ux-brand) 76%, var(--ux-accent));
        animation: ux-progress-slide 1.3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    @keyframes ux-progress-slide {
        0% {
            transform: translateX(-125%);
        }

        55% {
            transform: translateX(125%);
        }

        100% {
            transform: translateX(320%);
        }
    }
</style>