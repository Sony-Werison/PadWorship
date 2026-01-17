'use server';

/**
 * @fileOverview Checks the availability of Google Drive audio files provided by the user.
 *
 * - checkAudioFilesAvailability - A function that checks if the Google Drive file IDs are valid.
 * - CheckAudioFilesAvailabilityInput - The input type for the checkAudioFilesAvailability function.
 * - CheckAudioFilesAvailabilityOutput - The return type for the checkAudioFilesAvailability function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CheckAudioFilesAvailabilityInputSchema = z.object({
  fileIds: z
    .array(z.string())
    .describe('An array of Google Drive file IDs to check.'),
});
export type CheckAudioFilesAvailabilityInput = z.infer<
  typeof CheckAudioFilesAvailabilityInputSchema
>;

const CheckAudioFilesAvailabilityOutputSchema = z.object({
  availabilityReport: z
    .array(z.object({
      fileId: z.string().describe('The Google Drive file ID.'),
      isAvailable: z.boolean().describe('Whether the file is accessible.'),
      errorMessage: z.string().optional().describe('Error message if the file is not accessible.'),
    }))
    .describe('A report on the availability of each file.'),
});
export type CheckAudioFilesAvailabilityOutput = z.infer<
  typeof CheckAudioFilesAvailabilityOutputSchema
>;

export async function checkAudioFilesAvailability(
  input: CheckAudioFilesAvailabilityInput
): Promise<CheckAudioFilesAvailabilityOutput> {
  return checkAudioFilesAvailabilityFlow(input);
}

const prompt = ai.definePrompt({
  name: 'checkAudioFilesAvailabilityPrompt',
  input: {schema: CheckAudioFilesAvailabilityInputSchema},
  output: {schema: CheckAudioFilesAvailabilityOutputSchema},
  prompt: `You are a helpful assistant that checks the availability of Google Drive files.

  For each file ID provided, determine if the file is likely accessible. Consider a file inaccessible if the ID is invalid, or the Google Drive API returns an error.

  Input file IDs: {{fileIds}}

  Return a report with the availability status of each file.  If unavailable, provide an error message.
  The output should be structured as JSON.
  Example:
  {
    "availabilityReport": [
      {
        "fileId": "1aBcDeFgHiJ",
        "isAvailable": true
      },
      {
        "fileId": "invalidId",
        "isAvailable": false,
        "errorMessage": "Invalid file ID format."
      },
      {
        "fileId": "123Xyz",
        "isAvailable": false,
        "errorMessage": "File not found or access denied."
      }
    ]
  }
  `,
});

const checkAudioFilesAvailabilityFlow = ai.defineFlow(
  {
    name: 'checkAudioFilesAvailabilityFlow',
    inputSchema: CheckAudioFilesAvailabilityInputSchema,
    outputSchema: CheckAudioFilesAvailabilityOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
