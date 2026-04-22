import React from 'react';
import { Forms } from 'your-forms-library'; // Adjust the import based on your project's structure

const AudioLimiter = () => {
    return (
        <div>
            <Forms.FormTitle>Audio Limiter Settings</Forms.FormTitle>
            <Forms.FormText>
                Here you can adjust the audio limiting settings.
            </Forms.FormText>
        </div>
    );
};

export default AudioLimiter;