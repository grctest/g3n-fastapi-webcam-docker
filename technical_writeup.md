# Gemma 3n Webcam footage analyzer

The application's purpose is to enable analyzing webcam footage with Gemma 3n (E2B-it) with any system prompt and user prompts the user has in mind.

## Architecture

It's a docker container based web application, using Astro.JS to provide a React.JS frontend, and FastAPI to provide both backend REST API access to advanced python capabilities as well as serving as host to the frontend web app.

Once the user creates and runs a docker container using this project's docker image they're able to navigate to the URL: `localhost:8080/` to access the webapp and begin testing out Gemma 3n's visual processing capabilities to its full extent, using either CPU or GPU.

I chose to use Astro.JS for the following reasons:
* Adding pages is as simple as adding a `page.astro` file to `frontend\src\pages`, and a hyperlink to it from the index page.
* I am able to introduce frontend features using multiple different web frameworks, not just React; so if a desired frontend library/package is incompatible with React we can easily switch framework to accomodate the desried features.

I chose to use React for the following reasons:
* We are able to make use of the shadcn-ui components to radpidly create our UX.
* We make use of react framework specific libraries for handling the webcam and for crafting the list of detections, without which a significant amount of effort would have been spent on crafting these from scratch instead of focusing on Gemma 3n related development tasks.

I chose to use Python and FastAPI for the following reasons:
* I was able to successfully work with the Gemma 3n E2B-it model with python, whereas efforts to use the onnx model with transformers.js were unsuccessful.
* I was able to prove it worked, and work on the backend before working on the frontend by using the `/docs` FastAPI endpoint; this enabled me to rapidly prototype gemma 3n and gave me the confidence to move away from using electron in favour of this new architecture.

I chose to use Docker for the following reasons:
* Simplicity of setting up the environment capable of running Gemma 3n on the user's computer
* Able to build and distribute release containing the model, far exceeding GitHub's 2GB file size limit.

## Challenges which were overcome

### Electron -> FastAPI architecture change

I initially started out creating an electron application, however I ran into an issue whereby the model wasn't working with transformers.js, I've raised the following issues:

https://github.com/huggingface/transformers.js/issues/1383

https://huggingface.co/onnx-community/gemma-3n-E2B-it-ONNX/discussions/4

At this point I had made more progress with the frontend, and so felt that the best course of action was to drop the use of electron and to switch to creating a docker based webapp hosted by FastAPI so that I could access the model via python instead of node.js. Had I not made this switch I likely would not be succesfully submitting my completed project to the contest.

A major advantage of this change is that we never have to prompt the user to download the models, as all the files required are included in the docker container by default. With this change in mind I was able to reduce the complexity of the UX, enabling me to focus entirely on the usability of the frontend instead of focusing on model downloading issues in node.js.

### Compatibility checks

Initially I was just checking for CUDA support, but this was insufficient to be able to run the Gemma 3n model. We now check for a certain minimum generation of GPU for bfloat16 computation capabilities before we offer to compute gemma 3n vison tasks on the user's GPU.

## Why these technical choices were the right ones

The python backend introduces support for many different models, you could easily swap out E2B-it for E4B-it (or your own finetuned models).

The move away from electron to FastAPI was smart, I wouldn't have completed the task had I tried to stick to using electron.

In the end it works well if you're sensible as it's rather unbounded - you can attempt to oversubscribe your compute resources until it crashes. Run one or two agents at a time and it works well at the task given to it.

The way that the user is able to configure agents enables all possible use cases of gemma 3n (e2b-it) image processing tasks, so if you have an idea for how to possible address a significant real-world problem through image analysis you can do so easily with this application; this significantly reduces the barrier to entry for users to test out ideas and gemma 3n usecases.

The project is fully MIT licensed and available on GitHub as well as on the Docker hub, proving that this is a real engineered solution.

By using docker we simplify the setup process for the end user, no needing to setup python nor node.js developer environments to test out the application, they simply need docker installed on their computer then after running a couple commands will be able to navigate to the fully operation web app running locally on their machine in a fully offline manner (once downloaded).