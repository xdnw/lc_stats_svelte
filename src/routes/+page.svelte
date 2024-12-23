<script lang="ts">
  import Navbar from "../components/Navbar.svelte";
  import Sidebar from "../components/Sidebar.svelte";
  import Footer from "../components/Footer.svelte";
  import { onMount } from "svelte";
  import { config } from "./+layout";

type AdTemplate = {
    id: string;
    img: string;
    desc: string;
    subtitle: string;
    invite: string;
    bg: string;
    ad: boolean;
    label: string;
  };

  export const _adTemplates: AdTemplate[] = [
    {
      id: "1",
      img: "versus.jpg",
      desc: "Browse a variety of tables and graphs for our featured set of ongoing and historical alliance conflicts. Data is available to download in CSV format.",
      subtitle: "Alliance Conflicts",
      invite: "conflicts",
      bg: "",
      ad: false,
      label: "View Conflicts",
    },
    {
      id: "3",
      img: "sheet.jpg",
      desc: "Browse templates or create your custom table from a variety of game data. Share or export options available.",
      subtitle: "Table Builder",
      invite: "https://www.locutus.link/#/custom_table",
      bg: "#FFC929",
      ad: false,
      label: "Open Editor",
    },
    {
      id: "4",
      img: "graph.png",
      // graph
      desc: "Browse a selection of game charts. Share or export options available.",
      subtitle: "Chart Viewer",
      invite: "https://www.locutus.link/#/edit_graph",
      bg: "#FFC929",
      ad: false,
      label: "View Charts",
    },
    // {
    //   id: "4",
    //   img: "graph.png",
    //   desc: "Browse templates or create your custom chart from a variety of game data. Share or export options available.",
    //   subtitle: "Chart Viewer",
    //   invite: "#",
    //   bg: "#FFC929",
    //   ad: false,
    //   label: "View Graphs",
    // },
    {
      id: "1244684694956675113",
      img: "media2.png",
      desc: "Get breaking news about ongoing conflicts and share in their discussions. Available on the Media discord server.",
      subtitle: "Updates & Discussions",
      invite: "https://discord.gg/aNg9DnzqWG",
      bg: "#111",
      ad: true,
      label: "Join Now!",
    },
    {
      id: "0",
      img: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
      desc: "Loading...",
      subtitle: "Loading...",
      invite: "#",
      bg: "#EEE",
      ad: false,
      label: "Loading...",
    },
  ];
  let _guildId: string = "";

  // The matrix background animation
  onMount(() => {
    let queryParams = new URLSearchParams(window.location.search);
    let setGuild = queryParams.get("guild");
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
      const newTheme = document.documentElement.getAttribute("data-bs-theme") === "dark";
      ctx.fillStyle = darkTheme ? "rgba(16, 20, 28, 0.16)" : "rgba(255, 255, 255, 0.16)";
      if (darkTheme !== newTheme) {
        darkTheme = newTheme;
        if (updateClasses) {
          c.classList.remove(darkTheme ? 'bg-white' : 'bg-black');
          c.classList.add(darkTheme ? 'bg-black' : 'bg-white');
        }
        ctx.fillStyle = darkTheme ? "rgba(16, 20, 28, 1)" : "rgba(255, 255, 255, 1)";
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
      requestAnimationFrame(draw);
    }
    draw();
  });
</script>

<svelte:head>
  <title>Home</title>
</svelte:head>
<canvas id="c" class="bg-body"></canvas>
<Navbar />
<!-- <Sidebar /> -->
<div class="container-fluid" style="min-height: calc(100vh - 203px); z">
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
    {#each _adTemplates as adTemplate (adTemplate.id)}
      {#if adTemplate.id !== "0"}
        <div class="card m-2" style="width: 18rem;">
          <img
            src={adTemplate.img}
            style="background:{adTemplate.bg}"
            class="card-img-top img-fluid object-fit-fill"
            alt="..."
          />
          <div class="card-body" style="height: 9rem;">
            <h5 class="card-title">
              {#if adTemplate.ad}
                <span class="badge text-bg-light fs-6 me-1">Ad</span>
              {/if}
              {adTemplate.subtitle}
            </h5>
            <p class="card-text">{adTemplate.desc}</p>
          </div>
          <div class="card-footer">
            <a
              href={adTemplate.invite === "conflicts" && _guildId ? "conflicts?guild_id=" + _guildId : adTemplate.invite}
              class="btn btn-lg btn-secondary btn-outline-info border-3">{adTemplate.label}</a>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
<Footer />

<style lang="postcss">

  .card-img-top {
    height: 9rem;
    width: 18rem;
    object-fit: contain;
    display: block;
    margin-left: auto;
    margin-right: auto;
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
