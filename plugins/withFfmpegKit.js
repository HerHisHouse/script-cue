const { withPodfile } = require('expo/config-plugins');

const withFfmpegKit = (config) => {
    return withPodfile(config, (config) => {
        const podfileContent = config.modResults.contents;
        // Define the variable to force the 'audio' package (smaller, no 404)
        const variable = '$FFMPEG_KIT_PACKAGE = "audio"';

        // Insert it at the top if not present
        if (!podfileContent.includes(variable)) {
            config.modResults.contents = `${variable}\n${podfileContent}`;
        }
        return config;
    });
};

module.exports = withFfmpegKit;
