if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:memebro-test";
}

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:memebro-test";
}

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}
