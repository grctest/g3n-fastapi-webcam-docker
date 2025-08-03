// Built-in system personas for agents. Add new personas here to make them available in the UI.
export const defaultPersonas = [
  {
    id: "face",
    label: "Face Detector",
    description: "Detects faces in webcam images.",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Detect and count all faces in this image. Describe their appearances and locations.",
    captureMode: "interval"
  },
  {
    id: "fire",
    label: "Fire Detector",
    description: "Detects fire in webcam images.",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Analyze this image for any signs of fire, flames, or smoke. Describe the size, location, and severity if present.",
    captureMode: "interval"
  },
  {
    id: "dog_poop",
    label: "Dog Poop Detector", 
    description: "Detects dog poop in webcam images.",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Look for any dog poop or animal waste in this image. Describe its location and appearance if found.",
    captureMode: "interval"
  },
  {
    id: "image_captioning",
    label: "Image Captioning",
    description: "Generates detailed captions for webcam images.",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Provide a detailed caption describing everything you see in this image, including objects, people, actions, and setting.",
    captureMode: "interval"
  },
  {
    id: "object_detection",
    label: "Object Detection",
    description: "Detects objects in webcam images.",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Identify and list all objects visible in this image, including their approximate locations and descriptions.",
    captureMode: "interval"
  },
  {
    id: "scene_analysis",
    label: "Scene Analysis",
    description: "Analyzes scenes in webcam images.",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Analyze this scene comprehensively, describing the setting, atmosphere, activities, and any notable details.",
    captureMode: "interval"
  },
  {
    id: "manual_capture_demo",
    label: "Manual Capture Demo",
    description: "Demo agent for manual frame capture.",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Describe what you see in this manually captured image in detail.",
    captureMode: "manual"
  }
];