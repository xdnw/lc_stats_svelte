<script lang=ts>
import Main from '../components/Main.svelte'
import Navbar from '../components/Navbar.svelte'
import Sidebar from '../components/Sidebar.svelte'
import Footer from '../components/Footer.svelte'
import { onMount } from 'svelte';
// let count = 0;

// console.log("Hello World");

// let url = "https://locutus.s3.ap-southeast-2.amazonaws.com/test";

// let data;

// onMount(async () => {
//   try {
//     const response = await fetch('https://locutus.s3.ap-southeast-2.amazonaws.com/test');
//     data = await response.text();
//     console.log("Read from S3 bucket:", data);
//   } catch (error) {
//     console.error('Error reading from S3 bucket:', error);
//   }
// });
</script>
<Navbar />
<Sidebar />
<div class="container-fluid" style="min-height: calc(100vh - 203px);">
  <Main />
</div>
<Footer />