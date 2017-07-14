import React from 'react';
import Measure from 'react-measure';
import styles from './FixedSidebar.module.scss';
import getScrollTop from '../../utils/getScrollTop';

class FixedSidebar extends React.Component {
  render() {
    return (
      <Measure
        bounds={true}
        width={true}
      >
        {({ measureRef, contentRect }) => {
          return (
            <div ref={measureRef}>
              <div className={`${styles.FixedSidebar} ${this.props.className}`} ref={c => { this.sidebar = c; }} style={{
                width: contentRect.bounds.width + 60,
              }}>
                <div ref={c => { this.inner = c; }}>
                  {this.props.children}
                </div>
              </div>
            </div>
          );
        }}
      </Measure>
    );
  }
}

export default FixedSidebar;
