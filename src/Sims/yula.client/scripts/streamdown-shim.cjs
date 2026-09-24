const React = require("react");

function Streamdown(props) {
  return React.createElement("div", { className: props?.className }, props?.children);
}

module.exports = {
  Streamdown,
  defaultRemarkPlugins: {},
  defaultRehypePlugins: {},
};
