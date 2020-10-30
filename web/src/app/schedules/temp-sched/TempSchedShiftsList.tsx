import React, { ReactNode } from 'react'
import IconButton from '@material-ui/core/IconButton'
import Typography from '@material-ui/core/Typography'
import makeStyles from '@material-ui/core/styles/makeStyles'
import Tooltip from '@material-ui/core/Tooltip/Tooltip'
import Alert from '@material-ui/lab/Alert'
import AlertTitle from '@material-ui/lab/AlertTitle'
import ScheduleIcon from '@material-ui/icons/Schedule'
import Delete from '@material-ui/icons/Delete'
import Error from '@material-ui/icons/Error'
import _ from 'lodash-es'

import FlatList from '../../lists/FlatList'
import { fmt, Shift } from './sharedUtils'
import { UserAvatar } from '../../util/avatars'
import { useUserInfo } from '../../util/useUserInfo'
import { DateTime, Interval } from 'luxon'
import { useURLParam } from '../../actions'
import { relativeDate } from '../../util/timeFormat'
import { styles } from '../../styles/materialStyles'
import { parseInterval } from '../../util/shifts'

const useStyles = makeStyles((theme) => {
  return {
    alert: {
      margin: '8px 0 8px 0',
    },
    secondaryActionWrapper: {
      display: 'flex',
      alignItems: 'center',
    },
    secondaryActionError: {
      color: styles(theme).error.color,
    },
    shiftsContainer: {
      paddingRight: 8,
    },
  }
})

type TempSchedShiftsListProps = {
  value: Shift[]
  onRemove: (shift: Shift) => void

  start: string
  end: string
}

type FlatListSub = {
  subHeader: string
}

type FlatListItem = {
  title?: string
  subText?: string
  icon?: JSX.Element
  secondaryAction?: JSX.Element | null
  render?: (item: FlatListItem) => ReactNode
}

type FlatListListItem = FlatListSub | FlatListItem

export default function TempSchedShiftsList({
  start,
  end,
  value,
  onRemove,
}: TempSchedShiftsListProps): JSX.Element {
  const classes = useStyles()
  const _shifts = useUserInfo(value)
  const [zone] = useURLParam('tz', 'local')
  const schedInterval = parseInterval({ start, end })

  function items(): FlatListListItem[] {
    // sort shifts and add some properties
    const sortedShifts = _.sortBy(_shifts, 'start').map((s) => ({
      shift: s,
      added: false,
      start: DateTime.fromISO(s.start, { zone }),
      end: DateTime.fromISO(s.end, { zone }),
      interval: Interval.fromDateTimes(
        DateTime.fromISO(s.start, { zone }),
        DateTime.fromISO(s.end, { zone }),
      ),
      isValid: schedInterval.engulfs(parseInterval(s)),
    }))

    const result: FlatListListItem[] = []

    const displaySpan = Interval.fromDateTimes(
      DateTime.fromISO(start).startOf('day'),
      DateTime.fromISO(end).endOf('day'),
    )

    const days = displaySpan.splitBy({ days: 1 })
    days.forEach((day, dayIdx) => {
      const dayShifts = sortedShifts.filter((s) => day.overlaps(s.interval))

      // if no shifts, only render subheaders for start/end days
      if (!sortedShifts.length && dayIdx > 0 && dayIdx < days.length - 1) {
        return
      }

      // render subheader for each day
      result.push({
        subHeader: relativeDate(day.start),
      })

      // add start time of temp schedule to top of list
      if (dayIdx === 0) {
        result.push({
          render: () => (
            <Alert
              key='start'
              className={classes.alert}
              severity='success'
              icon={<ScheduleIcon />}
            >
              Starts at{' '}
              {DateTime.fromISO(start).setZone(zone).toFormat('h:mm a')}
            </Alert>
          ),
        })

        // render no coverage/get started below start time if no shifts
        if (!sortedShifts.length) {
          result.push({
            render: () => (
              <Alert
                key='no-coverage'
                className={classes.alert}
                severity='info'
              >
                <AlertTitle>No coverage</AlertTitle>
                Add a shift to get started
              </Alert>
            ),
          })
        }
      }

      // for temp scheds with at least 1 shift
      // render no coverage and continue if no shifts for the given day
      if (!dayShifts.length && sortedShifts.length) {
        return result.push({
          render: () => (
            <Alert
              key={day.start.toISO() + '-no-coverage'}
              className={classes.alert}
              severity='warning'
            >
              No coverage
            </Alert>
          ),
        })
      }

      // checkCoverage will determine if there is a gap of 1 minute or more between the given datetimes
      const checkCoverage = (s: DateTime, e: DateTime): boolean => {
        return Interval.fromDateTimes(s, e).length('minutes') > 1
      }

      // craft list items for each day
      dayShifts.forEach((s, shiftIdx) => {
        // check start of day coverage for the first shift
        // if on the first day, temp sched start is used
        const _s = dayIdx === 0 ? DateTime.fromISO(start) : day.start
        if (shiftIdx === 0 && checkCoverage(_s, s.start)) {
          result.push({
            render: () => (
              <Alert
                key={_s.toISO() + '-no-start-coverage'}
                className={classes.alert}
                severity='warning'
              >
                No coverage until {s.start.setZone(zone).toFormat('h:mm a')}
              </Alert>
            ),
          })
        }

        let shiftDetails = ''
        const startTime = s.start.toLocaleString({
          hour: 'numeric',
          minute: 'numeric',
        })
        const endTime = s.end.toLocaleString({
          hour: 'numeric',
          minute: 'numeric',
        })

        if (s.interval.engulfs(day)) {
          // shift (s.interval) spans all day
          shiftDetails = 'All day'
        } else if (day.engulfs(s.interval)) {
          // shift is inside the day
          shiftDetails = `From ${startTime} to ${endTime}`
        } else if (day.contains(s.end)) {
          shiftDetails = `Active until ${endTime}`
        } else {
          // shift starts and continues on for the rest of the day
          shiftDetails = `Active starting at ${startTime}`
        }

        result.push({
          title: s.shift.user.name,
          subText: shiftDetails,
          icon: <UserAvatar userID={s.shift.userID} />,
          secondaryAction: s.added ? null : (
            <div className={classes.secondaryActionWrapper}>
              {!s.isValid && (
                <Tooltip
                  title='This shift extends beyond the start and/or end of this temporary schedule'
                  placement='left'
                >
                  <Error className={classes.secondaryActionError} />
                </Tooltip>
              )}
              <IconButton onClick={() => onRemove(s.shift)}>
                <Delete />
              </IconButton>
            </div>
          ),
        })

        // prevents actions from rendering on each item if it's for the same shift
        s.added = true

        // check coverage until the next shift (if there is one) within the current day
        if (
          shiftIdx < dayShifts.length - 1 &&
          checkCoverage(s.end, dayShifts[shiftIdx + 1].start)
        ) {
          result.push({
            render: () => (
              <Alert
                key={s.end.toISO() + '-no-middle-coverage'}
                className={classes.alert}
                severity='warning'
              >
                No coverage from {fmt(s.end.toISO(), zone)} to{' '}
                {fmt(dayShifts[shiftIdx + 1].start.toISO(), zone)}
              </Alert>
            ),
          })
        }

        // check end of day/temp sched coverage
        // if on the last day, temp sched end is used
        const _e = dayIdx === days.length - 1 ? DateTime.fromISO(end) : day.end
        if (shiftIdx === dayShifts.length - 1 && checkCoverage(s.end, _e)) {
          result.push({
            render: () => (
              <Alert
                key={_e.toISO() + '-no-end-coverage'}
                className={classes.alert}
                severity='warning'
              >
                No coverage after {s.end.setZone(zone).toFormat('h:mm a')}
              </Alert>
            ),
          })
        }
      })
    })

    // add end time of temp schedule to bottom of list
    result.push({
      render: () => (
        <Alert
          key='end'
          className={classes.alert}
          severity='success'
          icon={<ScheduleIcon />}
        >
          Ends at {DateTime.fromISO(end).setZone(zone).toFormat('h:mm a')}
        </Alert>
      ),
    })

    return result
  }

  return (
    <div className={classes.shiftsContainer}>
      <Typography variant='subtitle1' component='h3'>
        Shifts
      </Typography>
      <FlatList
        items={items()}
        emptyMessage='Add a user to the left to get started.'
        dense
      />
    </div>
  )
}