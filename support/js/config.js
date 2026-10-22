// Site configuration. Everything that may change without touching the logic lives here.

export const CONFIG = {
  siteName: 'SparkPNT Device Support',
  siteVersion: '0.1.0',

  // Where reports go. Confirm the mailbox before publishing.
  supportEmail: 'cservice@sparkpnt.com',
  supportName: 'SparkPNT Support',

  // Firmware lists. The first one that loads wins. Add a SparkPNT list in front
  // of the SparkFun one when it exists.
  firmwareCsvUrls: [
    'https://raw.githubusercontent.com/sparkfun/SparkFun_RTK_Everywhere_Firmware_Binaries/main/RTK-Everywhere-Variants.csv',
  ],
  // Bare file names in the CSV resolve against this repository.
  binariesBase: 'https://raw.githubusercontent.com/sparkfun/SparkFun_RTK_Everywhere_Firmware_Binaries/main/',
  // Folder for the main (ESP32) binaries when the CSV gives a bare file name.
  esp32Folder: 'soc/esp32/',
  // The OTA data partition image that makes the bootloader start the freshly written app.
  bootApp0Url: 'https://raw.githubusercontent.com/sparkfun/SparkFun_RTK_Firmware_Uploader/main/RTK_Firmware_Uploader/resource/boot_app0.bin',
  // Flash addresses used by the SparkFun uploader.
  flash: { bootApp0: 0xe000, app: 0x10000 },
  // esptool-js, loaded only when an update starts.
  esptoolUrl: 'https://cdn.jsdelivr.net/npm/esptool-js@0.6.0/lib/index.js',
  // CH342 (and CH340) USB bridges share this vendor id.
  usbVendorId: 0x1a86,
  consoleBaud: 115200,
  // Seconds of live status to watch after the menus are read.
  liveWatchSeconds: 8,

  docs: {
    home: 'https://docs.sparkpnt.com',
    esp32Update: 'https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/firmware_update_esp32/',
    lg290pUpdate: 'https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/firmware_update_lg290p/',
    um980Update: 'https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/firmware_update_um980/',
    ubloxUpdate: 'https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/firmware_update_ublox/',
    mosaicUpdate: 'https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/firmware_update_mosaicX5/',
    loraUpdate: 'https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/firmware_update_stm32/',
    ch340Driver: 'https://learn.sparkfun.com/tutorials/how-to-install-ch340-drivers/all',
    uploaderGui: 'https://github.com/sparkfun/SparkFun_RTK_Firmware_Uploader',
    forum: 'https://community.sparkfun.com/',
    customerSupport: 'https://www.sparkpnt.com/pages/customer-support',
  },
};
