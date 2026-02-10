// post.js - Load preloaded dynamic libraries after module initialization

Module['postRun'] = Module['postRun'] || [];
Module['postRun'].push(function() {
  try {
    console.log('Loading dllcamlstr from preloaded file...');

    // dlopen the preloaded dllcamlstr.so library
    var handle = Module['FS'].dlopen('/dllcamlstr', {
      global: true,
      nodelete: true
    });

    if (handle) {
      console.log('Successfully loaded dllcamlstr');
    } else {
      console.error('Failed to load dllcamlstr');
    }
  } catch (e) {
    console.error('Error loading dllcamlstr:', e);
  }
});
