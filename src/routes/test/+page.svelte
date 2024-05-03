<svelte:head>
    <!-- Modify head -->
	<title>Test</title>
    <!-- set meta tab name -->
</svelte:head>
<script lang=ts>
import { onMount } from "svelte";
import { FeatureExtractionPipeline, Tensor, pipeline } from '@xenova/transformers';

let extractor: FeatureExtractionPipeline = null;

onMount(async () => {
    let test: string[] = [
        "The quick brown fox jumps over the lazy dog",
        "One two three four five six seven eight nine ten",
        "Hello world! This is a test of the emergency broadcast system.",
        "Bacon ipsum dolor amet short ribs pork loin, bresaola pork belly ham hock",
        "What is Lorem Ipsum? Lorem Ipsum is simply dummy text of the printing and typesetting industry.",
        "Henrietta, the marmoset, was a very curious creature. She loved to explore and discover new things.",
        "Foxes are small-to-medium-sized, omnivorous mammals belonging to several genera of the family Canidae.",
        "Emerson, Lake & Palmer were an English progressive rock supergroup formed in London in 1970.",
        "Broadcaster, writer and journalist, Stuart",
        "There are many variations of passages of Lorem Ipsum available, but the majority have suffered alteration in some form, by injected humour, or randomised words which don't look even slightly believable.",
        "The sun rises in the east and sets in the west.",
        "Mount Everest is the highest peak in the world.",
        "The Great Barrier Reef is a marvel of natural beauty.",
        "The Mona Lisa is an iconic piece of art.",
        "Shakespeare's plays are still performed today.",
        "The Pyramids of Giza are ancient wonders of the world.",
        "The Grand Canyon is a popular tourist destination.",
        "The Eiffel Tower is a symbol of France.",
        "The Amazon Rainforest is the world's largest tropical rainforest.",
        "The Sahara Desert is the largest hot desert in the world.",
        "The Mississippi River is one of the longest rivers in the world.",
        "The Great Wall of China can be seen from space.",
        "The Leaning Tower of Pisa is known for its tilt.",
        "The Colosseum in Rome is a historical landmark.",
        "The Northern Lights are a natural light display in the Earth's sky.",
        "The Sydney Opera House is a multi-venue performing arts centre in Sydney.",
        "The Statue of Liberty was a gift from France to the United States.",
        "The Louvre Museum is the world's largest art museum.",
        "The Dead Sea is a salt lake bordered by Jordan to the east and Israel and Palestine to the west.",
        "The Taj Mahal is an ivory-white marble mausoleum on the right bank of the Yamuna river in the Indian city of Agra.",
        "Roses are red, violets are blue, I'm using Svelte, how about you?",
        "Why don't scientists trust atoms? Because they make up everything!",
        "To be or not to be, that is the question.",
        "Life is what happens when you're busy making other plans.",
        "I told my wife she should embrace her mistakes... She gave me a hug.",
        "Two roads diverged in a wood, and I— I took the one less traveled by, And that has made all the difference.",
        "I'm reading a book about anti-gravity. It's impossible to put down!",
        "In the middle of every difficulty lies opportunity.",
        "I have nothing to declare except my genius.",
        "I asked my friend to help me with a math problem. He said, 'Don't worry, this is a piece of pi.'",
        "The only thing we have to fear is fear itself.",
        "I was going to tell a time-traveling joke, but you didn't like it.",
        "I wandered lonely as a cloud that floats on high o'er vales and hills.",
        "The journey of a thousand miles begins with one step.",
        "I told my friend she drew her eyebrows too high. She seemed surprised."
    ];
    console.log("LOADING")
    // Allocate a pipeline for sentiment-analysis
    extractor = await pipeline('feature-extraction', 'TaylorAI/bge-micro-v2');
    console.log("Loaded extractor");
    // add all the above sentences
    for (let i = 0; i < test.length; i++) {
        console.log("Adding sentence: " + test[i]);
        await addSentence(test[i]);
        console.log("Added sentence: " + test[i]);
    }
    console.log("Added all sentences");
});

let currentSentence: string = "Put a sentence in the input below to get started";
let sentences: {
    text: string,
    vector: Tensor,
    similarity: number
}[] = [];

let newSentence: string = "";
let newSentenceVector: Tensor = null;
let compareSentence: string = "";

async function addSentence(input: string) {
    const output = await extractor(input, { pooling: 'mean', normalize: true });
    sentences.push({
        text: input,
        vector: output, // You need to calculate the vector for the new sentence
        similarity:  newSentenceVector ? cosineSimilarity(newSentenceVector, output) : 0
    })
    sentences = [...sentences].sort((a, b) => b.similarity - a.similarity);
    console.log("Added sentence: " + input + " | " + sentences.length);
}

async function addInputSentence() {
    let tmp = newSentence;
    addSentence(tmp);
    newSentence = "";
}

async function compareSentences() {
    console.log("Comparing sentences");
    let tmp = compareSentence;
    const output = await extractor(tmp, { pooling: 'mean', normalize: true });
    newSentenceVector = output;
    sentences.forEach(sentence => {
        sentence.similarity = cosineSimilarity(sentence.vector, output);
    });
    // force svelte update of sentences
    sentences = [...sentences].sort((a, b) => b.similarity - a.similarity);
    currentSentence = tmp;
    console.log("Compared sentences");
}
function cosineSimilarity(vecA: Tensor, vecB: Tensor): number {
    const dotProduct = vecA.data.reduce((sum, a, i) => sum + a * vecB.data[i], 0);
    const normA = Math.sqrt(vecA.data.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.data.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (normA * normB);
}

</script>
<!-- current  -->
<span>
    <p>{currentSentence}</p>
</span>
<table id="output">
<thead>
    <tr>
        <th>Sentence</th>
        <th>Similarity</th>
    </tr>
</thead>
<tbody>
<!-- svelte for sentences -->
{#if sentences && sentences.length > 0}
    {#each sentences as sentence}
        <tr>
            <td>{sentence.text}</td>
            <td>{sentence.similarity}</td>
        </tr>
    {/each}
{:else}
    <tr>
        <td colspan="2">No sentences to display</td>
    </tr>
{/if}
</tbody>
</table>

<!-- if extractor is defined -->
{#if extractor != null}
    <div>
        <input bind:value={newSentence} placeholder="Add a new sentence" />
        <button on:click={addInputSentence}>Submit</button>
    </div>

    <div>
        <input bind:value={compareSentence} placeholder="Set the current sentence" />
        <button on:click={compareSentences}>Submit</button>
    </div>
{/if}