import type { CharacterGender } from "@/lib/character-prompt";

/** The head-swap LoRA follows the wording closely, so the subject noun has to match the face being brought in. */
const FACE_SWAP_SUBJECTS: Record<CharacterGender, string> = { female: "woman", male: "white man" };

export function faceSwapPrompt(gender: CharacterGender = "female") {
  const subject = FACE_SWAP_SUBJECTS[gender];
  return `head_swap: start with Picture 1 as the base image, keeping its lighting, environment, and background. remove the head of only the ${subject} from Picture 1 completely and replace it with the head of the ${subject} from Picture 2, strictly preserving the hair, eye color, nose structure of the ${subject} in Picture 2. copy the direction of the eye, head rotation, micro expressions of the ${subject} from Picture 1, high quality, sharp details, 4k`;
}

export const FACE_SWAP_PROMPT = faceSwapPrompt("female");

export const FACE_SWAP_LORAS = [
  { name: "https://huggingface.co/DeepBeepMeep/Qwen_image/resolve/main/loras_accelerators/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", strength: 0.8 },
  { name: "bfs_head_v5_2511_merged_version_rank_16_fp16.safetensors", strength: 0.5 },
] as const;

export const FACE_SWAP_STEPS = 4;