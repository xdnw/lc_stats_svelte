<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getQueryParam } from "$lib/queryState";
  import { warmConflictsIndexPayload } from "$lib/prefetchArtifacts";
  import { appConfig as config } from "$lib/appConfig";
  import versusCardUrl from "../../static/versus.jpg";
  import sheetCardUrl from "../../static/sheet.jpg";
  import statusCardUrl from "../../static/images/home/status.svg";
  import commandsCardUrl from "../../static/images/home/commands.svg";
  import multiV2CardUrl from "../../static/images/home/multi-v2.svg";
  import graphCardUrl from "../../static/graph.png";
  import chestCardUrl from "../../static/chest.png";
  import mediaCardUrl from "../../static/media2.png";

  type CardTemplate = {
    ad: boolean;
    svg: string;
    desc: string;
    subtitle: string;
    invite: string;
    label: string;
    bg: string;
  };
  const inlineSvgPrefix = "<svg";

  const isInlineSvg = (svg: string): boolean => svg.trimStart().startsWith(inlineSvgPrefix);

  const locutusBaseUrl = "https://www.locutus.link/#";

  export const _cardTemplates: {
    [key: string]: CardTemplate;
  } = {
    conflicts: {
      svg: versusCardUrl,
      desc: "Browse a variety of tables and graphs for our featured set of ongoing and historical alliance conflicts. Data is available to download in CSV format.",
      subtitle: "Alliance Conflicts",
      invite: "conflicts",
      ad: false,
      label: "View Conflicts",
      bg: "",
    },
    table_builder: {
      svg: sheetCardUrl,
      desc: "Browse templates or create your custom table from a variety of game data. Share or export options available.",
      subtitle: "Table Builder",
      invite: "https://www.locutus.link/#/custom_table",
      ad: false,
      label: "Open Editor",
      bg: "#FFC929",
    },
    status: {
      svg: statusCardUrl,
      desc: "Check live system health, incidents, and component uptime.",
      subtitle: "Service Status",
      invite: `${locutusBaseUrl}/status`,
      ad: false,
      label: "Open Status",
      bg: "#0f172a",
    },
    commands: {
      svg: commandsCardUrl,
      desc: "Run and explore available bot commands from the web UI.",
      subtitle: "Commands",
      invite: `${locutusBaseUrl}/commands`,
      ad: false,
      label: "Open Commands",
      bg: "#0f172a",
    },
    multi_v2: {
      svg: multiV2CardUrl,
      desc: "Inspect the newer multi-check flow for a selected nation.",
      subtitle: "Multi Checker v2",
      invite: `${locutusBaseUrl}/multi_v2/`,
      ad: false,
      label: "Open Multi v2",
      bg: "#0f172a",
    },
    chart_viewer: {
      svg: graphCardUrl,
      desc: "Browse templates or create your custom chart from a variety of game data. Share or export options available.",
      subtitle: "Chart Viewer",
      invite: "https://www.locutus.link/#/edit_graph",
      ad: false,
      label: "View Charts",
      bg: "#FFC929",
    },
    raid_finder: {
      svg: chestCardUrl,
      subtitle: "Raid Finder",
      desc: "Find raidable nations in your score range",
      invite: "https://www.locutus.link/#/raid",
      ad: false,
      label: "Find Targets",
      bg: "#2EC2A0",
    },
    rankings: {
      svg: `<svg viewBox="0 0 320 160" xmlns="http://www.w3.org/2000/svg" role="img"><rect width="320" height="160" fill="#0f172a"/><g fill="#060e1e"><polygon points="89,80 131,80 143,160 101,160"/><polygon points="139,60 181,60 193,160 151,160"/><polygon points="189,100 231,100 243,160 201,160"/></g><line x1="70" y1="140" x2="250" y2="140" stroke="#1e2d45" stroke-width="2"/><rect x="89" y="80" width="42" height="60" rx="3" fill="#6366f1"/><rect x="139" y="60" width="42" height="80" rx="3" fill="#f59e0b"/><rect x="189" y="100" width="42" height="40" rx="3" fill="#6366f1"/><text x="110" y="73" text-anchor="middle" fill="#e0e7ff" font-size="13" font-family="sans-serif" font-weight="bold">2</text><text x="160" y="52" text-anchor="middle" fill="#fef3c7" font-size="13" font-family="sans-serif" font-weight="bold">1</text><text x="210" y="93" text-anchor="middle" fill="#e0e7ff" font-size="13" font-family="sans-serif" font-weight="bold">3</text></svg>`,
      ad: false,
      desc: "Browse templates or create a custom ranking table from a variety of game data. Share or export options available.",
      subtitle: "Rankings",
      invite: "https://www.locutus.link/#/edit_ranking",
      label: "Rankings",
      bg: "#0f172a",
    },
    treaty_history: {
      svg: `<svg viewBox="0 0 320 160" xmlns="http://www.w3.org/2000/svg" role="img"><rect width="320" height="160" fill="#0f172a"/><g fill="#060e1e" stroke="#060e1e" stroke-linecap="round" stroke-linejoin="round"><polygon points="88,102 152,58 1152,1058 1088,1102"/><polygon points="152,58 216,80 1216,1080 1152,1058"/><polygon points="216,80 252,116 1252,1116 1216,1080"/><polygon points="152,58 228,38 1228,1038 1152,1058"/><polygon points="228,38 216,80 1216,1080 1228,1038"/><polygon points="88,102 216,80 1216,1080 1088,1102"/><polygon points="72,86 104,86 1104,1086 1072,1086"/><polygon points="136,42 168,42 1168,1042 1136,1042"/><polygon points="200,64 232,64 1232,1064 1200,1064"/><polygon points="236,100 268,100 1268,1100 1236,1100"/><polygon points="212,22 244,22 1244,1022 1212,1022"/></g><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M88 102L152 58L216 80L252 116" stroke="#94a3b8" stroke-width="5"/><path d="M152 58L228 38L216 80L88 102" stroke="#22c55e" stroke-width="5"/></g><g stroke-width="4"><circle cx="88" cy="102" r="16" fill="#1e293b" stroke="#38bdf8"/><circle cx="152" cy="58" r="16" fill="#1e293b" stroke="#38bdf8"/><circle cx="216" cy="80" r="16" fill="#1e293b" stroke="#38bdf8"/><circle cx="252" cy="116" r="16" fill="#1e293b" stroke="#38bdf8"/><circle cx="228" cy="38" r="16" fill="#1e293b" stroke="#f59e0b"/></g><circle cx="152" cy="58" r="5" fill="#22c55e"/><circle cx="216" cy="80" r="5" fill="#22c55e"/><circle cx="228" cy="38" r="5" fill="#fef3c7"/></svg>`,
      ad: false,
      desc: "Explore historical treaty relationships between alliances as a connected graph.",
      subtitle: "Treaty History",
      invite: "https://treaty.locutus.link",
      label: "View Treaties",
      bg: "#0f172a",
    },
    // updates_discussions: {
    //   svg: mediaCardUrl,
    //   desc: "Get breaking news about ongoing conflicts and share in their discussions. Available on the Media discord server.",
    //   subtitle: "Updates & Discussions",
    //   invite: "https://discord.gg/aNg9DnzqWG",
    //   ad: true,
    //   label: "Join Now!",
    //   bg: "#111",
    // },
  };

  type CardTemplateKey = keyof typeof _cardTemplates;

  const cardTemplateKeys = Object.keys(_cardTemplates) as CardTemplateKey[];
  let _guildId: string = "";
  let matrixAnimationFrame: number | null = null;

  // The matrix background animation
  onMount(() => {
    let setGuild = getQueryParam("guild") || getQueryParam("guild_id");
    if (setGuild) {
      _guildId = setGuild;
    }

    let c: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      matrix: string[],
      font_size: number,
      columns: number,
      drops: number[];
    c = document.getElementById("c") as HTMLCanvasElement;
    ctx = c.getContext("2d") as CanvasRenderingContext2D;
    //making the canvas full screen
    c.height = window.innerHeight;
    c.width = window.innerWidth;
    //characters - taken from the unicode charset
    let charset: string =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";
    //converting the string into an array of single characters
    matrix = charset.split("");

    font_size = 12;
    let fontStr: string = `${font_size}px monospace`;
    columns = c.width / font_size; //number of columns for the rain
    //an array of drops - one per column
    drops = [];
    //x below is the x coordinate
    //1 = y co-ordinate of the drop(same for every drop initially)
    for (let x = 0; x < columns; x++)
      drops[x] = Math.floor(Math.random() * c.height);

    // Start the animation
    let frameCount: number = 0;
    let darkTheme: boolean | undefined = undefined;
    const updateTheme = (updateClasses: boolean) => {
      const newTheme =
        document.documentElement.getAttribute("data-bs-theme") === "dark";
      ctx.fillStyle = darkTheme
        ? "rgba(16, 20, 28, 0.16)"
        : "rgba(255, 255, 255, 0.16)";
      if (darkTheme !== newTheme) {
        darkTheme = newTheme;
        if (updateClasses) {
          c.classList.remove(darkTheme ? "bg-white" : "bg-black");
          c.classList.add(darkTheme ? "bg-black" : "bg-white");
        }
        ctx.fillStyle = darkTheme
          ? "rgba(16, 20, 28, 1)"
          : "rgba(255, 255, 255, 1)";
      }
    };
    updateTheme(true);
    ctx.fillRect(0, 0, c.width, c.height);
    //drawing the characters
    function draw() {
      frameCount++;
      if (frameCount % 6 === 0) {
        //Black BG for the canvas
        //translucent BG to show trail
        if (frameCount % 24 === 0) {
          updateTheme(true);
          ctx.fillRect(0, 0, c.width, c.height);
        }

        ctx.fillStyle = "#FEB64B"; //green text
        ctx.font = fontStr;
        //looping over drops
        for (let i = 0; i < drops.length; i++) {
          //a random character to print
          const text: string =
            matrix[Math.floor(Math.random() * matrix.length)];
          //x = i*font_size, y = value of drops[i]*font_size
          ctx.fillText(text, i * font_size, drops[i] * font_size);

          //sending the drop back to the top randomly after it has crossed the screen
          //adding a randomness to the reset to make the drops scattered on the Y axis
          if (drops[i] * font_size > c.height && Math.random() > 0.975)
            drops[i] = 0;

          //incrementing Y coordinate
          drops[i]++;
        }
      }
      // Call the next frame
      matrixAnimationFrame = requestAnimationFrame(draw);
    }
    draw();

    // Warm conflicts index in idle time only when the coordinator allows it.
    warmConflictsIndexPayload({
      priority: "idle",
      reason: "route-home-idle-conflicts-index",
      intentStrength: "idle",
    });
  });

  onDestroy(() => {
    if (matrixAnimationFrame != null) {
      cancelAnimationFrame(matrixAnimationFrame);
      matrixAnimationFrame = null;
    }
  });
</script>

<svelte:head>
  <title>Home</title>
</svelte:head>
<canvas id="c" class="bg-body"></canvas>
<div class="container-fluid ux-page-body">
  <section>
    <header class="welcome-text">
      <svg class="welcome" style="overflow: visible;">
        <text x="50%" y="50%" dy=".35em" text-anchor="middle">
          {config.application}
        </text>
      </svg>
    </header>
  </section>
  <br />
  <div class="d-flex flex-wrap justify-content-center">
    {#each cardTemplateKeys as cardKey (cardKey)}
      {@const cardTemplate = _cardTemplates[cardKey]}
      <div class="card m-2 ux-home-card">
        <div
          class="card-img-top ux-home-card-media"
          style={`background:${cardTemplate.bg}`}
          aria-label={cardTemplate.subtitle + " card"}
        >
          {#if isInlineSvg(cardTemplate.svg)}
            <div class="ux-home-card-svg" aria-hidden="true">{@html cardTemplate.svg}</div>
          {:else}
            <img
              src={cardTemplate.svg}
              class="img-fluid object-fit-fill"
              alt={cardTemplate.subtitle + " card"}
            />
          {/if}
        </div>
        <div class="card-body ux-home-card-body">
          <h5 class="card-title ux-home-card-title">
            {#if cardTemplate.ad}
              <span class="badge text-bg-light fs-6 me-1">Ad</span>
            {/if}
            {cardTemplate.subtitle}
          </h5>
          <p class="card-text ux-home-card-text">{cardTemplate.desc}</p>
        </div>
        <div class="card-footer ux-home-card-footer">
          <a
            href={cardTemplate.invite === "conflicts" && _guildId
              ? "conflicts?guild=" + _guildId
              : cardTemplate.invite}
            class="btn ux-btn w-100 fw-semibold"
            >{cardTemplate.label}</a
          >
        </div>
      </div>
    {/each}
  </div>
</div>

<style lang="postcss">
  @import url("https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap");

  .card-img-top {
    height: 9rem;
    width: 100%;
    display: block;
    margin-left: auto;
    margin-right: auto;
  }

  .ux-home-card-media {
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  .ux-home-card-media img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .ux-home-card-svg {
    width: 100%;
    height: 100%;
  }

  .ux-home-card-svg :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .ux-home-card {
    width: 18rem;
    display: flex;
    flex-direction: column;
  }

  .ux-home-card-body {
    display: grid;
    align-content: start;
    gap: 0.24rem;
    min-height: 7.4rem;
    height: auto;
  }

  .ux-home-card-title {
    font-size: 0.96rem;
    line-height: 1.18;
  }

  .ux-home-card-text {
    font-size: 0.7rem;
    line-height: 1.2;
    color: var(--ux-text-muted);
    margin: 0;
  }

  .ux-home-card-footer {
    margin-top: auto;
  }
  /* background canvas style */
  canvas {
    width: 100%;
    height: 100%;
    margin: 0;
    top: 0;
    left: 0;
    position: absolute; /* Required for z-index to work */
    z-index: -1; /* Any negative number to put it behind other elements */
  }
  /* The css for the animated logo */
  section {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    flex: 0.6;
    text-align: center;
  }

  .welcome-text {
    font-weight: 700;
    font-family: "Chakra Petch", var(--ux-font-sans);
    display: block;
    text-align: center;
    text-transform: uppercase;
    animation:
      stroke 5s forwards,
      banner 6s forwards !important;
    stroke-width: 4;
    stroke: rgb(59, 70, 73); /* Set the outline color */
    fill: rgb(254, 182, 75); /* Set the fill color */
    font-size: 6vw;
    /* text-shadow:1px 1px 0 hsl(36, 99%, 65%),2px 2px 0 hsl(36, 99%, 62%),3px 3px 0 hsl(36, 99%, 60%),4px 4px 0 hsl(36, 99%, 58%),5px 5px 0 hsl(36, 99%, 56%),6px 6px 0 hsl(36, 99%, 54%),7px 7px 0 hsl(36, 99%, 52%),8px 8px 0 hsl(36, 99%, 50%),0 0 5px rgba(255,255,255,.05),1px 1px 3px rgba(255,255,255,.2),2px 2px 5px rgba(255,255,255,.2),4px 4px 10px rgba(255,255,255,.2),8px 8px 10px rgba(255,255,255,.2),16px 16px 20px rgba(255,255,255,.3); */
    text-shadow:
      1px 1px 0 hsl(36, 99%, 32.5%),
      2px 2px 0 hsl(36, 99%, 31%),
      3px 3px 0 hsl(36, 99%, 30%),
      4px 4px 0 hsl(36, 99%, 29%),
      5px 5px 0 hsl(36, 99%, 28%),
      6px 6px 0 hsl(36, 99%, 27%),
      7px 7px 0 hsl(36, 99%, 26%),
      8px 8px 0 hsl(36, 99%, 25%),
      0 0 5px rgba(0, 0, 0, 0.05),
      1px 1px 3px rgba(0, 0, 0, 0.2),
      2px 2px 5px rgba(0, 0, 0, 0.2),
      4px 4px 10px rgba(0, 0, 0, 0.2),
      8px 8px 10px rgba(0, 0, 0, 0.2),
      16px 16px 20px rgba(0, 0, 0, 0.3);
  }

  @keyframes stroke {
    0% {
      fill: rgb(254, 182, 75); /* Use the same fill color */
      stroke: rgb(59, 70, 73); /* Use the same outline color */
      stroke-dashoffset: 25%;
      stroke-dasharray: 0 50%;
      stroke-width: 4;
    }
    70% {
      fill: rgb(254, 182, 75); /* Use the same fill color */
      stroke: rgb(59, 70, 73); /* Use the same outline color */
      stroke-width: 4;
    }
    80% {
      fill: rgb(254, 182, 75); /* Use the same fill color */
      stroke: rgb(59, 70, 73); /* Use the same outline color */
      stroke-width: 4;
    }
    100% {
      fill: rgb(254, 182, 75); /* Use the same fill color */
      stroke: rgb(59, 70, 73); /* Use the same outline color */
      stroke-dashoffset: -25%;
      stroke-dasharray: 50% 0;
      stroke-width: 0;
    }
  }
  @keyframes banner {
    0% {
      opacity: 0;
      text-shadow:
        0 0 40px rgb(254, 182, 75),
        0 0 20px rgb(254, 182, 75),
        0 0 10px rgb(254, 182, 75),
        0 0 80px rgb(254, 182, 75);
      letter-spacing: 100px;
      transform: translate(8px, 8px) scale(1.3);
    }
    60% {
      opacity: 1;
      text-shadow: 0 0 1px rgb(254, 182, 75);
      letter-spacing: auto;
      transform: translate(8px, 8px) scale(1);
    }
    80% {
      text-shadow: 0 0 1px rgb(254, 182, 75);
      transform: translate(8px, 8px);
    }
    100% {
      letter-spacing: 5px;
      text-shadow: auto;
      transform: translate(0, 0);
    }
  }
</style>
